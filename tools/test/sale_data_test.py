"""實價登錄買賣整理的測試：用虛構的買賣 CSV（欄位同官方格式）跑 tools/fetch_sale.py，
檢查門牌解析、篩選、社區分組、名冊對名稱、輸出格式。不連網。  python3 tools/test/sale_data_test.py"""
import csv, io, json, sys, tempfile, zipfile
from datetime import date
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import fetch_sale as S  # noqa: E402

HEAD = ["鄉鎮市區", "交易標的", "土地位置建物門牌", "土地移轉總面積平方公尺", "都市土地使用分區", "非都市土地使用分區", "非都市土地使用編定",
        "交易年月日", "交易筆棟數", "移轉層次", "總樓層數", "建物型態", "主要用途", "主要建材", "建築完成年月", "建物移轉總面積平方公尺",
        "建物現況格局-房", "建物現況格局-廳", "建物現況格局-衛", "建物現況格局-隔間", "有無管理組織", "總價元", "單價元平方公尺",
        "車位類別", "車位移轉總面積平方公尺", "車位總價元", "備註", "編號", "主建物面積", "附屬建物面積", "陽台面積", "電梯", "移轉編號"]
EN = ["The villages and towns urban district"] + ["x"] * (len(HEAD) - 1)
fail = 0


def ok(name, cond, info=""):
    global fail
    if not cond:
        fail += 1
        print("✗", name, info)


def row(dist, addr, ym, price, area=110.0, floor="十二層", floors="十五層", typ="住宅大樓(11層含以上有電梯)", use="住家用", built="1060315",
        rooms=3, car=0, car_area=0.0, target="房地(土地+建物)", note="", sid=None, pens="土地1建物1車位0"):
    row.i = getattr(row, "i", 0) + 1
    v = dict.fromkeys(HEAD, "")
    v.update({"鄉鎮市區": dist, "交易標的": target, "土地位置建物門牌": addr, "交易年月日": ym, "交易筆棟數": pens, "移轉層次": floor,
              "總樓層數": floors, "建物型態": typ, "主要用途": use, "建築完成年月": built, "建物移轉總面積平方公尺": str(area),
              "建物現況格局-房": str(rooms), "總價元": str(price), "車位總價元": str(car), "車位移轉總面積平方公尺": str(car_area),
              "備註": note, "編號": sid or f"RP{row.i}"})
    return [v[h] for h in HEAD]


def make_zip(path, by_code):
    with zipfile.ZipFile(path, "w") as z:
        for code, rows in by_code.items():
            buf = io.StringIO(); w = csv.writer(buf)
            w.writerow(HEAD); w.writerow(EN)
            for r in rows:
                w.writerow(r)
            z.writestr(f"{code}_lvr_land_a.csv", "﻿" + buf.getvalue())
            z.writestr(f"{code}_lvr_land_c.csv", "ignored")


# ---------- 門牌與數字
ok("門牌：全形、段、樓層", S.parse_addr("臺中市南區福田二街１８０號十二樓之３") == ("南區", "福田二街", 180), S.parse_addr("臺中市南區福田二街１８０號十二樓之３"))
ok("門牌：數字段改國字、巷弄", S.parse_addr("中山路2段566巷2-7號", "大甲區") == ("大甲區", "中山路二段566巷", 2), S.parse_addr("中山路2段566巷2-7號", "大甲區"))
ok("門牌：大道", S.parse_addr("臺中市西屯區台灣大道四段７６１號") == ("西屯區", "台灣大道四段", 761), S.parse_addr("臺中市西屯區台灣大道四段７６１號"))
ok("門牌：村里鄰", S.parse_addr("新市區新和里10鄰忠孝街90巷35弄2號等") == ("新市區", "忠孝街90巷35弄", 2), S.parse_addr("新市區新和里10鄰忠孝街90巷35弄2號等"))
ok("門牌：地號不算", S.parse_addr("文德段456地號") is None)
ok("樓層", [S.floor_num(x) for x in ("十二層", "十五層", "三十二層", "全", "", "地下一層", "12樓")] == [12, 15, 32, 0, 0, 0, 12])
ok("社區名稱整理", [S.clean_name(x) for x in ("%允將海安管理委員會%", "江南藝術園林管委會", "好吉第*", "宏美社區")] == ["允將海安", "江南藝術園林", "好吉第", "宏美社區"])
ok("完工日", S.built_day("1060315") == 20170315 and S.built_day("0680207") == 19790207 and S.built_day("") == 0)

with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    today = date(2026, 11, 25)   # 3 年 → 2023-11 起
    A = "臺中市南區福田二街{}號{}"
    b_rows = [
        row("南區", A.format("１８０", "十二樓"), "1150801", 13_500_000, area=140.0, car=1_500_000, car_area=35.0, target="房地(土地+建物)+車位", pens="土地1建物1車位1"),
        row("南區", A.format("１８２", "五樓"), "1150301", 10_600_000, area=84.0),
        row("南區", A.format("１８６", "九樓"), "1141101", 12_000_000, area=135.0, car=0, car_area=35.0, target="房地(土地+建物)+車位", pens="土地1建物1車位1"),
        row("南區", A.format("１８０", "一樓"), "1131201", 9_000_000, area=120.0, floor="一層"),
        row("南區", A.format("１８０", "七樓"), "1150901", 8_000_000, note="親友、員工、共有人或其他特殊關係間之交易"),   # 排除
        row("南區", A.format("１８０", "七樓"), "1121001", 8_000_000),                                             # 太舊
        row("南區", "臺中市南區福田二街２００號三樓", "1150601", 9_000_000, built="1100520", floors="十四層"),         # 另一個社區
        row("南區", "臺中市南區忠孝路６６巷６號３樓", "1150601", 5_000_000, typ="公寓(5樓含以下無電梯)", built="0750101", floors="五層"),
        row("南區", "臺中市南區復新街８３號", "1150601", 12_000_000, typ="透天厝", floor="全", floors="三層"),       # 透天不收
        row("南區", "文德段456地號", "1150601", 850_000, target="土地"),                                           # 土地
        row("南區", A.format("１８８", "三樓"), "1150601", 7_000_000, use="商業用", rooms=0),                      # 非住宅
        row("南區", A.format("１８８", "六樓"), "1150701", 11_000_000, note="陽台外推；其他增建；"),               # 增建：照算有標記
    ]
    b_rows.append(b_rows[1][:])   # 重複編號
    d_rows = [
        row("北區", "臺南市北區長榮路五段４１巷９號八樓之３", "1150901", 8_800_000, built="0920916", floors="十四層"),
        row("北區", "臺南市北區長榮路五段４１巷１１號三樓", "1150301", 8_000_000, built="0920916", floors="十四層"),
        row("東區", "臺南市東區裕信路３４６號五樓", "1150301", 6_000_000, built="0940101", floors="十二層"),
    ]
    z1 = td / "a.zip"
    make_zip(z1, {"b": b_rows, "d": d_rows, "x": [row("某區", "某路1號", "1150101", 1_000_000)]})
    clusters, frm, total = S.build([z1.read_bytes(), z1.read_bytes()], today)
    ok("期間起點", frm == "2023-11", frm)
    ok("只收三市", set(clusters) == {"b", "d"}, set(clusters))
    bc = {(c["dist"], c["street"], c["built"], c["floors"]): c for c in clusters["b"]}
    home = bc.get(("南區", "福田二街", 20170315, 15))
    ok("同社區分在一起（含一樓、增建；排除親友、太舊、商業、重複）", home and len(home["rows"]) == 5, home and [r["id"] for r in home["rows"]])
    ok("社區門牌範圍", home and (home["nmin"], home["nmax"]) == (180, 188), home and (home["nmin"], home["nmax"]))
    ok("另一個社區（完工日、樓層不同）", ("南區", "福田二街", 20210520, 14) in bc)
    ok("公寓也收", ("南區", "忠孝路66巷", 19860101, 5) in bc, list(bc))
    ok("透天、土地不收", len(clusters["b"]) == 3, list(bc))
    r0 = next(r for r in home["rows"] if r["no"] == 180 and r["floor"] == 12)
    ok("金額千元、坪數扣車位、車位數", r0["price"] == 13500 and r0["car"] == 1500 and r0["carN"] == 1 and abs(r0["ping"] - 31.8) < .1, r0)
    ok("增建標記", any(r["flags"] & S.F_ADD for r in home["rows"]))

    # 臺南名冊對名稱
    reg = [{"dist": "北區", "street": "長榮路五段41巷", "no": 9, "year": 2003, "floors": 14, "name": "長榮新城"},
           {"dist": "東區", "street": "裕信路", "no": 500, "year": 2005, "floors": 12, "name": "太遠的社區"},
           {"dist": "北區", "street": "長榮路五段41巷", "no": 11, "year": 2015, "floors": 14, "name": "年份不對"}]
    hit = S.match_names(clusters["d"], reg)
    dn = {c["street"]: c["name"] for c in clusters["d"]}
    ok("名冊對名稱", hit == 1 and dn.get("長榮路五段41巷") == "長榮新城" and dn.get("裕信路") == "", dn)
    names = {"d": S.names_for("d", clusters["d"], reg),
             "b": S.names_for("b", [], [{"dist": "南區", "year": 2017, "hh": 150, "name": "測試社區"}])}
    ok("臺南名稱清單：對到的有 key、沒對到的沒有", any(n[0] == "長榮新城" and n[2] for n in names["d"]) and any(n[0] == "太遠的社區" and not n[2] for n in names["d"]), names["d"])

    out = td / "out"
    S.write(out, clusters, frm, "2026-09", names, today)
    idx = json.loads((out / "index.json").read_text(encoding="utf-8"))
    ok("index：欄位、縣市", idx["rowCols"] == S.ROW_COLS and idx["clusterCols"] == S.CLUSTER_COLS and set(idx["counties"]) == {"b", "d"}, idx)
    ok("index：名稱模式", idx["counties"]["b"]["nameMode"] == "pick" and idx["counties"]["d"]["nameMode"] == "match")
    f = json.loads((out / "b" / "南區.json").read_text(encoding="utf-8"))
    C = {k: i for i, k in enumerate(S.ROW_COLS)}
    ok("行政區檔：社區與成交", len(f["clusters"]) == 3 and len(f["rows"]) == 7, (len(f["clusters"]), len(f["rows"])))
    ok("成交由新到舊", all(f["rows"][i][C["ym"]] >= f["rows"][i + 1][C["ym"]] for i in range(len(f["rows"]) - 1)))
    ci = next(i for i, c in enumerate(f["clusters"]) if c[0] == "福田二街" and c[1] == 20170315)
    ok("成交指到正確社區", sum(1 for r in f["rows"] if r[C["c"]] == ci) == 5)
    nb = json.loads((out / "b" / "names.json").read_text(encoding="utf-8"))
    ok("臺中名冊", nb["names"] == [["測試社區", "南區", "", 2017, 150]], nb)
    ok("再寫一次會清掉舊檔", (S.write(out, clusters, frm, "2026-09", {}, today) or True) and not (out / "b" / "names.json").exists())

print("買賣資料測試：" + ("全部通過" if not fail else f"{fail} 項失敗"))
sys.exit(1 if fail else 0)
