"""租金行情整理的測試：用虛構的實價登錄租賃 CSV（欄位同官方格式）跑 tools/fetch_rent.py，檢查篩選與統計。
不連網、只用標準函式庫。  python3 tools/test/rent_data_test.py"""
import csv, io, json, sys, tempfile, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import fetch_rent as F  # noqa: E402

HEAD = ["鄉鎮市區", "交易標的", "土地位置建物門牌", "租賃年月日", "建物型態", "主要用途", "建物總面積平方公尺",
        "建物現況格局-房", "建物現況格局-廳", "建物現況格局-衛", "總額元", "車位類別", "車位面積平方公尺", "車位總額元", "備註", "編號", "出租型態",
        "建築完成年月", "有無附傢俱", "有無電梯", "租賃住宅服務"]
EN = ["The villages and towns urban district", "transaction sign"] + ["x"] * (len(HEAD) - 2)


def row(dist, ym, rooms, rent, area=99.17, typ="住宅大樓(11層含以上有電梯)", use="住家用", car=0, car_area=0, note="", sid=None, kind="整棟(戶)出租", target="租賃房屋",
        built="1060815", furn="無", lift="有", svc="一般"):
    row.i = getattr(row, "i", 0) + 1
    return [dist, target, "某路某號", ym, typ, use, str(area), str(rooms), "2", "2", str(rent), "", str(car_area), str(car), note, sid or f"ID{row.i}", kind, built, furn, lift, svc]


def make_zip(path, rows, code="b"):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(HEAD); w.writerow(EN)
    for r in rows:
        w.writerow(r)
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(f"{code}_lvr_land_c.csv", "﻿" + buf.getvalue())
        z.writestr(f"{code}_lvr_land_a.csv", "ignored")


fail = 0
def ok(name, cond, info=""):
    global fail
    if not cond:
        fail += 1
        print("✗", name, info)


with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    # today 2026-11-16 → 期間 2025-10 ~ 2026-09
    rows = [
        row("南區", "1150815", 3, 30000), row("南區", "1150701", 3, 32000), row("南區", "1150301", 3, 28000), row("南區", "1141101", 3, 31000),
        row("南區", "1150601", 2, 22000, area=66.1, typ="華廈(10層含以下有電梯)"),
        row("南區", "1150601", 3, 36000, car=3000, car_area=33.06),          # 含車位：扣 3,000 → 33,000
        row("南區", "1150601", 3, 99999, note="親友間租賃"),                 # 排除：特殊關係
        row("南區", "1150601", 1, 9000, kind="獨立套房"),                    # 排除：套房出租型態
        row("南區", "1150601", 3, 30000, use="商業用"),                      # 排除：非住家
        row("南區", "1150601", 0, 30000),                                     # 排除：沒有房數
        row("南區", "1141001", 3, 50000),                                     # 期間第一個月，要算
        row("南區", "1140901", 3, 50000),                                     # 太舊，排除
        row("南區", "1151001", 3, 50000),                                     # 太新（延遲期內），排除
        row("北屯區", "1150501", 5, 45000),                                   # 5 房 → 4
    ]
    rows.append(row("南區", "1150901", 2, 26000, built="1100300", svc="社會住宅包租轉租", furn="有"))  # 社宅、附家具：統計照算，逐筆有標記
    rows.append(row("南區", "1150901", 2, 24000, built="", lift="無", typ="公寓(5樓含以下無電梯)"))   # 完工年不明
    rows.append(rows[0][:])                                                     # 重複編號，只算一次
    rows.append(row("南區", "1150601", 3, 30000, target="租賃房屋+車位"))       # 含車位寫法，要算
    rows.append(row("南區", "1150601", 3, 30000, target="租賃土地"))            # 排除：只租土地
    z1 = td / "s1.zip"; make_zip(z1, rows)
    z2 = td / "s2.zip"; make_zip(z2, [row("西屯區", "1150501", 2, 25000, target="房地(土地+建物)")], code="b")  # 舊格式寫法也要算
    out = td / "out"
    F.main(["--out", str(out), "--zip", str(z1), str(z2), "--today", "2026-11-16"])
    idx = json.loads((out / "index.json").read_text(encoding="utf-8"))
    ok("期間", idx["window"] == {"from": "2025-10", "to": "2026-09"}, idx["window"])
    ok("縣市索引", idx["counties"]["b"]["name"] == "臺中市" and idx["counties"]["b"]["n"] == 12, idx["counties"])
    b = json.loads((out / "b.json").read_text(encoding="utf-8"))["districts"]
    s3 = b["南區"]["rooms"]["3"]
    # 逐筆資料（24 個月）
    rf = json.loads((out / "b" / "南區.json").read_text(encoding="utf-8"))["rows"]
    C = {k: i for i, k in enumerate(idx["rows"]["cols"])}
    ok("逐筆欄位", idx["rows"]["cols"] == F.ROW_COLS and idx["rows"]["from"] == "2024-10", idx["rows"])
    ok("逐筆由新到舊", all(rf[i][0] >= rf[i + 1][0] for i in range(len(rf) - 1)), [r[0] for r in rf])
    ok("逐筆含 12 個月以前（2025-09）", any(r[0] == 202509 for r in rf))
    car = [r for r in rf if r[C["car"]] == 3000]
    ok("含車位：月租扣車位、車位租金、park", car and car[0][C["rent"]] == 33000 and car[0][C["park"]] == 1 and abs(car[0][C["ping"]] - 20.0) < .1, car)
    ok("交易標的寫車位也算含車位", sum(r[C["park"]] for r in rf) == 2, [r[C["park"]] for r in rf])
    ok("完工年", rf[-1][C["built"]] == 2017 and any(r[C["built"]] == 0 for r in rf), [r[C["built"]] for r in rf])
    soc = [r for r in rf if r[C["flags"]] & F.F_SOCIAL]
    ok("社宅＋附家具標記", len(soc) == 1 and soc[0][C["flags"]] & F.F_FURN and soc[0][C["built"]] == 2021, soc)
    ok("電梯標記", sum(1 for r in rf if r[C["flags"]] & F.F_LIFT) == len(rf) - 1)
    ok("型態代碼", idx["rows"]["types"][rf[0][C["type"]]] in ("大樓", "公寓"), rf[0])
    ok("roc_year", F.roc_year("1060815") == 2017 and F.roc_year("106") == 2017 and F.roc_year("") == 0 and F.roc_year("0") == 0)
    ok("南區 3 房筆數（排除特殊、套房、商業、無房數、期間外、重複、只租土地）", s3["n"] == 7, s3)
    ok("南區 3 房中位數", s3["med"] == 31000, s3)   # 28000,30000,30000,31000,32000,33000,50000
    ok("25%／75% 位數", s3["p25"] < s3["med"] < s3["p75"], s3)
    ok("每坪月租（扣車位面積）", abs(s3["ping"] - 31000 / (99.17 / F.PING)) < 2, s3)
    ok("型態分組", b["南區"]["type"]["華廈"]["n"] == 1 and b["南區"]["type"]["大樓"]["n"] == 8, b["南區"]["type"])
    ok("5 房以上歸到 4", b["北屯區"]["rooms"]["4"]["n"] == 1)
    ok("多個 zip 合併", b["西屯區"]["all"]["n"] == 1)
    ok("季別代碼", F.season_codes(__import__("datetime").date(2026, 11, 16), 3) == ["115S3", "115S2", "115S1"])
    # 欄位改名時要清楚報錯
    bad = td / "bad.zip"
    with zipfile.ZipFile(bad, "w") as z:
        z.writestr("b_lvr_land_c.csv", "鄉鎮市區,總額元\n南區,1\n")
    try:
        F.main(["--out", str(td / "o2"), "--zip", str(bad), "--today", "2026-11-16"]); ok("缺欄位要報錯", False)
    except RuntimeError as e:
        ok("缺欄位報錯訊息", "缺少欄位" in str(e), e)

print("租金行情測試：" + ("全部通過" if not fail else f"{fail} 項失敗"))
sys.exit(1 if fail else 0)
