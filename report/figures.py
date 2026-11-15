"""Figures for the Agnikaal scientific report. Reads results.json (from analyze.mjs) and the
region binaries in public/data. Writes SVG figures into report/fig/."""
import json, os, struct
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle
from matplotlib.colors import LogNorm, LinearSegmentedColormap

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "public", "data")
OUT = os.path.join(HERE, "fig")
os.makedirs(OUT, exist_ok=True)
R = json.load(open(os.path.join(HERE, "results.json")))

INK, MUTED, GRID = "#1d2433", "#5b6478", "#e6e8ee"
C_MOD, C_VII, C_HAR, C_NAI = "#3b6ea8", "#e8762c", "#b3261e", "#8a8f9c"
CTRY = {"india": "#d1495b", "australia": "#e8762c", "canada": "#2f7f6f", "united_states": "#3b6ea8", "argentina": "#7b5ea7"}
MON = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]
MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
FIRE = LinearSegmentedColormap.from_list("fire", ["#fff7ec", "#fdd49e", "#fc8d59", "#d7301f", "#7f0000", "#2b0000"])

plt.rcParams.update({
    "font.family": "Helvetica Neue", "font.size": 8.5, "axes.titlesize": 9.5, "axes.titleweight": "bold",
    "axes.labelsize": 8.5, "axes.edgecolor": "#9aa1b0", "axes.linewidth": 0.6, "axes.labelcolor": INK,
    "xtick.color": MUTED, "ytick.color": MUTED, "xtick.major.width": 0.5, "ytick.major.width": 0.5,
    "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.5,
    "legend.frameon": False, "legend.fontsize": 7.5, "svg.fonttype": "none", "text.color": INK,
    "axes.titlelocation": "left", "figure.dpi": 150,
})


def save(fig, name):
    fig.savefig(os.path.join(OUT, name + ".svg"), bbox_inches="tight", pad_inches=0.04)
    plt.close(fig)


def panel(ax, letter):
    ax.text(-0.02, 1.06, letter, transform=ax.transAxes, fontsize=10, fontweight="bold", va="bottom", ha="right")


# ---------------------------------------------------------------- Fig 1: workflow diagram
def fig_workflow():
    fig, ax = plt.subplots(figsize=(7.2, 2.9))
    ax.set_xlim(0, 100); ax.set_ylim(0, 40); ax.axis("off")

    def box(x, y, w, h, title, body, fc, ec):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.6", fc=fc, ec=ec, lw=0.9))
        ax.text(x + w / 2, y + h - 2.6, title, ha="center", va="top", fontsize=8, fontweight="bold", color=INK)
        ax.text(x + w / 2, y + h - 7.0, body, ha="center", va="top", fontsize=6.6, color=MUTED, linespacing=1.35)

    def arrow(x0, y0, x1, y1):
        ax.annotate("", xy=(x1, y1), xytext=(x0, y0), arrowprops=dict(arrowstyle="-|>", color="#7a8194", lw=0.9, mutation_scale=9))

    # inputs
    box(0, 27, 17, 12, "MODIS C6.1", "Terra + Aqua, 1 km\n2000–2025", "#eaf1f9", C_MOD)
    box(0, 13.5, 17, 12, "VIIRS S-NPP", "375 m, C2\n2012–2025", "#fdf0e6", C_VII)
    box(0, 0, 17, 12, "VIIRS NOAA-20/21", "375 m, archive\n+ live NRT feed", "#fdf0e6", C_VII)
    # processing chain
    box(22, 13.5, 16, 25.5, "1  Quality filter", "MODIS conf ≥ 30\nVIIRS nominal/high\ntype = 0 (vegetation)\ndrops volcanoes,\ngas flares, industry", "#f6f7fa", "#9aa1b0")
    box(42, 13.5, 16, 25.5, "2  Common grid", "snap to 0.01° (~1 km)\none count per cell\nper day = Fire\nCell-Day (FCD)\n→ 0.25° tiles", "#f6f7fa", "#9aa1b0")
    box(62, 13.5, 16, 25.5, "3  Calibration", "per area, per month\nk = ΣV / ΣM, 2012–25\nempirical-Bayes\nshrinkage (λ = 25)\n+ uncertainty band", "#f6f7fa", "#9aa1b0")
    box(82, 13.5, 18, 25.5, "4  Validation", "leave-one-year-out\ncross-validation\nvs naive raw splice\nR², MAPE, bias\nrun live per area", "#f6f7fa", "#9aa1b0")
    # outputs
    box(22, 0, 78, 10, "", "", "#fbeceb", C_HAR)
    ax.text(61, 6.6, "One harmonized record 2001 → today (VIIRS-equivalent FCD)", ha="center", va="center", fontsize=8, fontweight="bold", color=C_HAR)
    ax.text(61, 2.8, "fire calendar · season clock · trends · live early warning · AI outlook · Research Lab · exports",
            ha="center", va="center", fontsize=6.8, color=MUTED)
    for y in (33, 19.5):
        arrow(17.6, y, 21.5, 26)
    arrow(17.6, 6, 21.5, 6)
    for x0, x1 in ((38.6, 41.5), (58.6, 61.5), (78.6, 81.5)):
        arrow(x0, 26, x1, 26)
    arrow(91, 13, 91, 10.6)
    save(fig, "fig1_workflow")


# ---------------------------------------------------------------- Fig 2: study area map from cell totals
def region_cell_totals(rid):
    meta = json.load(open(os.path.join(DATA, rid + ".json")))
    buf = open(os.path.join(DATA, rid + ".bin"), "rb").read()
    s = meta["series"]["M_fcd"]
    k = np.frombuffer(buf, dtype="<u4", count=s["n"], offset=s["offset"])
    v = np.frombuffer(buf, dtype="<u4", count=s["n"], offset=s["offset"] + s["n"] * 4)
    cells = np.array(meta["cells"]).reshape(-1, 2)
    tot = np.bincount(k >> 9, weights=v, minlength=len(cells))
    lat = cells[:, 0] * meta["res"] - 90 + meta["res"] / 2
    lon = cells[:, 1] * meta["res"] - 180 + meta["res"] / 2
    return lon, lat, tot


def fig_map():
    fig, ax = plt.subplots(figsize=(7.2, 3.3))
    ax.set_facecolor("#f4f6fa")
    allv = []
    for rid in CTRY:
        lon, lat, tot = region_cell_totals(rid)
        keep = tot > 0
        allv.append((lon[keep], lat[keep], tot[keep]))
    vmax = max(t.max() for _, _, t in allv)
    for lon, lat, tot in allv:
        sc = ax.scatter(lon, lat, c=tot, s=0.35, marker="s", cmap=FIRE, norm=LogNorm(1, vmax), linewidths=0, rasterized=True)
    for cid, c in R["cases"].items():
        w, s_, e, n = c["bbox"]
        ax.add_patch(Rectangle((w, s_), e - w, n - s_, fill=False, ec=INK, lw=0.7))
    labels = {"punjab": "Punjab", "central": "C. India", "blacksummer": "NSW", "california": "California", "quebec": "Québec",
              "chaco": "Chaco", "kimberley": "Top End", "northeast": "NE India", "kerala": "Kerala", "parana": "Paraná"}
    off = {"punjab": (-2, 3), "central": (2, -7), "kerala": (-15, -3), "northeast": (2, 2), "blacksummer": (3, -4), "kimberley": (-3, 3),
           "california": (-30, -4), "quebec": (2, 2), "chaco": (3, 1), "parana": (3, -5)}
    for cid, c in R["cases"].items():
        w, s_, e, n = c["bbox"]
        dx, dy = off.get(cid, (2, 2))
        ax.text(e + dx if dx >= 0 else w + dx, n + dy if dy >= 0 else s_ + dy, labels[cid], fontsize=6.2, color=INK)
    ax.set_xlim(-170, 175); ax.set_ylim(-56, 72)
    ax.set_aspect("equal"); ax.grid(False)
    ax.set_xticks(range(-150, 180, 30)); ax.set_yticks(range(-45, 75, 15))
    ax.tick_params(labelsize=6.5)
    cb = fig.colorbar(sc, ax=ax, fraction=0.022, pad=0.01)
    cb.set_label("MODIS Fire Cell-Days per 0.25° tile, 2000–2025", fontsize=7); cb.ax.tick_params(labelsize=6.5)
    cb.outline.set_linewidth(0.4)
    save(fig, "fig2_map")


# ---------------------------------------------------------------- Fig 3: the seam problem (India)
def fig_seam():
    g = R["regions"]["india"]
    yrs = np.array(g["years"])
    fig, axs = plt.subplots(1, 2, figsize=(7.2, 2.7), gridspec_kw={"width_ratios": [1.15, 1]})
    ax = axs[0]
    ax.plot(yrs, np.array(g["Mr"]) / 1e3, color=C_MOD, lw=1.2, label="MODIS raw detections")
    v = np.array(g["Vr"], float); v[yrs < 2012] = np.nan
    ax.plot(yrs, v / 1e3, color=C_VII, lw=1.2, label="VIIRS raw detections")
    ax.plot(yrs, np.array(g["naive"]) / 1e3, color=INK, lw=1.6, ls=(0, (3, 2)), label="Naive splice (MODIS → VIIRS)")
    ax.axvline(2011.5, color="#c0c4cf", lw=0.8); ax.text(2011.7, 20, "VIIRS starts", fontsize=6.5, color=MUTED)
    ax.set_ylabel("Detections per year (thousands)"); ax.set_title("Raw counts: a 5.4× break in 2012")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), ncol=2, fontsize=6.6); panel(ax, "a")
    ax = axs[1]
    H = np.array(g["H"]) / 1e3
    ax.fill_between(yrs, np.array(g["lo"]) / 1e3, np.array(g["hi"]) / 1e3, color=C_HAR, alpha=0.15, lw=0, label="Calibration uncertainty")
    ax.plot(yrs, H, color=C_HAR, lw=1.6, marker="o", ms=2.4, label="Harmonized (VIIRS-equivalent FCD)")
    ax.plot(yrs, np.array(g["M"]) / 1e3, color=C_MOD, lw=1, alpha=0.8, label="MODIS FCD (uncalibrated)")
    ax.axvline(2011.5, color="#c0c4cf", lw=0.8)
    ax.set_ylabel("Fire Cell-Days per year (thousands)"); ax.set_title("Harmonized: one continuous record")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), ncol=2, fontsize=6.6); panel(ax, "b")
    ax.set_ylim(0, None)
    fig.tight_layout(w_pad=2.2)
    save(fig, "fig3_seam")


# ---------------------------------------------------------------- Fig 4: monthly calibration factors
def fig_k():
    fig, ax = plt.subplots(figsize=(7.2, 2.6))
    x = np.arange(12)
    for rid, col in CTRY.items():
        g = R["regions"][rid]
        k = np.array(g["cal"]["k"]); sd = np.array(g["cal"]["sd"])
        ax.plot(x, k, color=col, lw=1.5, marker="o", ms=3, label=f"{g['name']}  (pooled k = {g['cal']['kAll']:.2f})")
        ax.fill_between(x, np.maximum(0, k - sd), k + sd, color=col, alpha=0.08, lw=0)
    ax.axhline(1, color=MUTED, lw=0.7, ls=":"); ax.text(11.2, 1.05, "k = 1", fontsize=6.5, color=MUTED, ha="right")
    ax.set_xticks(x, MON3); ax.set_ylabel("k = VIIRS FCD / MODIS FCD")
    ax.set_title("Monthly MODIS→VIIRS calibration factors, 2012–2025 overlap")
    ax.legend(ncol=2, loc="upper left", fontsize=7); ax.set_ylim(0, None)
    save(fig, "fig4_k")


# ---------------------------------------------------------------- Fig 5: validation
def fig_validation():
    fig, axs = plt.subplots(1, 3, figsize=(7.2, 2.5), gridspec_kw={"width_ratios": [1.05, 1, 1]})
    ax = axs[0]
    g = R["regions"]["india"]
    P = np.array(g["pairs"], float)
    k = np.array(g["cal"]["k"])
    mon = np.arange(len(P)) % 12
    pred = k[mon] * P[:, 0]
    ok = (P[:, 1] > 0) & (pred > 0)
    sc = ax.scatter(pred[ok], P[ok, 1], c=mon[ok], cmap="twilight_shifted", s=7, lw=0, alpha=0.9)
    lim = [max(10, min(pred[ok].min(), P[ok, 1].min())), max(pred.max(), P[:, 1].max()) * 1.3]
    ax.plot(lim, lim, color=INK, lw=0.7, ls="--")
    ax.set_xscale("log"); ax.set_yscale("log"); ax.set_xlim(lim); ax.set_ylim(lim)
    ax.set_xlabel("Calibrated MODIS (k·M), FCD/month"); ax.set_ylabel("Observed VIIRS, FCD/month")
    ax.set_title("India, 168 overlap months"); panel(ax, "a")
    cb = fig.colorbar(sc, ax=ax, fraction=0.05, pad=0.02, ticks=[0, 3, 6, 9])
    cb.ax.set_yticklabels(["Jan", "Apr", "Jul", "Oct"], fontsize=6); cb.outline.set_linewidth(0.3)
    names = [R["regions"][r]["name"].replace("United States", "USA") for r in CTRY]
    y = np.arange(len(CTRY))
    ax = axs[1]
    r2h = [R["regions"][r]["val"]["r2"] for r in CTRY]
    r2n = [max(-0.6, R["regions"][r]["val"]["naiveR2"]) for r in CTRY]
    ax.barh(y + 0.2, r2h, 0.38, color=C_HAR, label="Harmonized (LOYO-CV)")
    ax.barh(y - 0.2, r2n, 0.38, color=C_NAI, label="Naive raw splice")
    for i, v in enumerate(r2h): ax.text(v + 0.02, i + 0.2, f"{v:.2f}", va="center", fontsize=6.5)
    ax.set_yticks(y, names); ax.axvline(0, color=INK, lw=0.6); ax.set_xlim(-0.6, 1.15)
    ax.set_xlabel("R² against VIIRS"); ax.set_title("Skill"); ax.legend(loc="upper center", bbox_to_anchor=(0.6, -0.30), ncol=2, fontsize=6.3); panel(ax, "b")
    ax.grid(axis="y", visible=False)
    ax = axs[2]
    bh = [R["regions"][r]["val"]["bias"] for r in CTRY]
    bn = [R["regions"][r]["val"]["naiveBias"] for r in CTRY]
    ax.barh(y + 0.2, bh, 0.38, color=C_HAR); ax.barh(y - 0.2, bn, 0.38, color=C_NAI)
    for i, v in enumerate(bn): ax.text(v - 2, i - 0.2, f"{v:.0f}%", va="center", ha="right", fontsize=6.5)
    for i, v in enumerate(bh): ax.text(2, i + 0.2, f"{v:+.1f}%", va="center", fontsize=6.5)
    ax.set_yticks(y, []); ax.axvline(0, color=INK, lw=0.6); ax.set_xlim(-100, 22)
    ax.set_xlabel("Volume bias vs VIIRS (%)"); ax.set_title("Bias"); panel(ax, "c")
    ax.grid(axis="y", visible=False)
    fig.tight_layout(w_pad=1.2)
    save(fig, "fig5_validation")


# ---------------------------------------------------------------- Fig 6: harmonized national series
def fig_national():
    fig, axs = plt.subplots(1, 5, figsize=(7.2, 1.9), sharex=True)
    for ax, (rid, col) in zip(axs, CTRY.items()):
        g = R["regions"][rid]; yrs = np.array(g["years"]); H = np.array(g["H"]) / 1e3
        ax.fill_between(yrs, np.array(g["lo"]) / 1e3, np.array(g["hi"]) / 1e3, color=col, alpha=0.15, lw=0)
        ax.plot(yrs, H, color=col, lw=1.3)
        t = g["trend"]
        line = (t["intercept"] + t["slope"] * yrs) / 1e3
        ax.plot(yrs, line, color=INK, lw=0.8, ls="--")
        sig = "p < 0.01" if t["p"] < 0.01 else f"p = {t['p']:.2f}"
        ax.set_title(g["name"].replace("United States", "USA"), fontsize=8.5)
        ax.text(0.03, 0.95, f"{t['pctPerDecade']:+.0f}%/decade\n{sig}", transform=ax.transAxes, fontsize=6.2, va="top", color=MUTED)
        ax.set_ylim(0, None); ax.tick_params(labelsize=6.2)
        ax.set_xticks([2005, 2015, 2025], ["'05", "'15", "'25"])
    axs[0].set_ylabel("FCD per year (k)")
    fig.tight_layout(w_pad=0.6)
    save(fig, "fig6_national")


# ---------------------------------------------------------------- Fig 7: fire calendars
def fig_calendars():
    ids = [("punjab", "Punjab–Haryana (crop residue)"), ("central", "Central India (deciduous forest)"),
           ("blacksummer", "New South Wales (Black Summer)"), ("quebec", "Québec (boreal)")]
    fig, axs = plt.subplots(1, 4, figsize=(7.2, 3.7), sharey=True)
    for ax, (cid, title) in zip(axs, ids):
        c = R["cases"][cid]
        M = np.array([[np.nan if v is None else v for v in row] for row in c["calendar"]], float)
        im = ax.imshow(M, aspect="auto", cmap=FIRE, norm=LogNorm(max(1, np.nanpercentile(M[M > 0], 5)), np.nanmax(M)),
                       extent=[-0.5, 11.5, 2025.5, 2000.5], interpolation="nearest")
        ax.axhline(2011.5, color="white", lw=0.6, ls="--")
        ax.set_xticks(range(12), MON, fontsize=6.3); ax.grid(False)
        ax.set_title(title, fontsize=7.3)
        cb = fig.colorbar(im, ax=ax, orientation="horizontal", fraction=0.045, pad=0.07)
        cb.ax.tick_params(labelsize=5.5); cb.outline.set_linewidth(0.3)
    axs[0].set_yticks(range(2001, 2026, 3)); axs[0].tick_params(axis="y", labelsize=6.3)
    fig.text(0.5, 0.005, "Harmonized Fire Cell-Days per month (log colour scale; dashed line = start of VIIRS, 2012)", ha="center", fontsize=6.8, color=MUTED)
    fig.tight_layout(w_pad=0.4)
    save(fig, "fig7_calendars")


# ---------------------------------------------------------------- Fig 8: season clocks
def fig_clocks():
    ids = [("punjab", "Punjab"), ("kerala", "Kerala"), ("northeast", "NE India"), ("blacksummer", "NSW"),
           ("kimberley", "Top End"), ("california", "California"), ("quebec", "Québec"), ("chaco", "Gran Chaco")]
    fig, axs = plt.subplots(2, 4, figsize=(7.2, 3.9), subplot_kw={"projection": "polar"})
    for ax, (cid, name) in zip(axs.ravel(), ids):
        c = R["cases"][cid]; med = np.array(c["climMed"]); p90 = np.array(c["climP90"])
        th = (np.arange(12) + 0.5) / 12 * 2 * np.pi
        crit = set(c["season"]["critical"])
        cols = [C_HAR if m in crit else "#f2b8a6" for m in range(12)]
        ax.bar(th, med / med.max(), width=2 * np.pi / 12 * 0.92, color=cols, lw=0)
        ax.set_theta_zero_location("N"); ax.set_theta_direction(-1)
        ax.set_xticks(th, MON, fontsize=6); ax.set_yticks([]); ax.grid(color=GRID, lw=0.4)
        ax.spines["polar"].set_linewidth(0.4)
        s = c["season"]
        ax.set_title(f"{name}\npeak {MON3[s['peak']]} · concentration {s['concentration']:.2f}", fontsize=7, pad=14, loc="center")
    fig.tight_layout(h_pad=1.2)
    save(fig, "fig8_clocks")


# ---------------------------------------------------------------- Fig 9: Punjab October -> November shift
def fig_punjab():
    c = R["cases"]["punjab"]
    cal = np.array([[np.nan if v is None else v for v in row] for row in c["calendar"]], float)
    yrs = np.arange(2001, 2026)
    fig, axs = plt.subplots(1, 2, figsize=(7.2, 2.4), gridspec_kw={"width_ratios": [1.5, 1]})
    ax = axs[0]
    ax.plot(yrs, cal[:, 9] / 1e3, color="#e8762c", lw=1.5, marker="o", ms=2.5, label="October")
    ax.plot(yrs, cal[:, 10] / 1e3, color="#7f0000", lw=1.5, marker="s", ms=2.5, label="November")
    for m, col in ((9, "#e8762c"), (10, "#7f0000")):
        b = np.polyfit(yrs, cal[:, m] / 1e3, 1)
        ax.plot(yrs, np.polyval(b, yrs), color=col, lw=0.7, ls="--")
    ax.set_ylabel("Harmonized FCD (thousands)"); ax.set_title("Punjab–Haryana: burning moves from October to November")
    ax.legend(loc="upper left"); panel(ax, "a")
    ax = axs[1]
    share = cal[:, 10] / (cal[:, 9] + cal[:, 10])
    ax.bar(yrs, share * 100, color=["#7f0000" if s > 0.5 else "#e8762c" for s in share], width=0.8)
    ax.axhline(50, color=INK, lw=0.6, ls=":")
    ax.set_ylabel("November share of Oct+Nov (%)"); ax.set_ylim(0, 100); ax.set_title("November share"); panel(ax, "b")
    ax.set_xticks([2005, 2010, 2015, 2020, 2025])
    fig.tight_layout(w_pad=2)
    save(fig, "fig9_punjab")


# ---------------------------------------------------------------- Fig 10: weather drivers
def fig_drivers():
    D = R["drivers"]
    ids = [("blacksummer", "New South Wales"), ("california", "California"), ("central", "Central India"), ("punjab", "Punjab–Haryana")]
    ids = [x for x in ids if x[0] in D]
    fig, axs = plt.subplots(1, 2, figsize=(7.2, 2.3), gridspec_kw={"width_ratios": [1, 1.5]})
    ax = axs[0]
    y = np.arange(len(ids))[::-1]
    vals = [D[i]["r2"] for i, _ in ids]
    cols = ["#2f7f6f" if v > 0.5 else "#e8a33c" if v > 0.15 else "#b3261e" for v in vals]
    ax.barh(y, vals, color=cols, height=0.6)
    for yy, v in zip(y, vals): ax.text(v + 0.02, yy, f"{v * 100:.0f}%", va="center", fontsize=7)
    ax.set_yticks(y, [n for _, n in ids]); ax.set_xlim(0, 1)
    ax.set_xlabel("Share of year-to-year variance explained (LOYO R²)")
    ax.set_title("How much is weather-driven?"); ax.grid(axis="y", visible=False); panel(ax, "a")
    ax = axs[1]
    labs = [i["label"] for i in D[ids[0][0]]["imp"]]
    pal = ["#8fb8de", "#3b6ea8", "#e8762c", "#7b5ea7", "#9aa1b0", "#2f7f6f"]
    left = np.zeros(len(ids))
    for j, lab in enumerate(labs):
        w = np.array([D[i]["imp"][j]["share"] * D[i]["r2"] for i, _ in ids])
        ax.barh(y, w, left=left, color=pal[j], height=0.6, label=lab)
        left += w
    ax.set_yticks(y, []); ax.set_xlim(0, 1); ax.grid(axis="y", visible=False)
    ax.set_xlabel("Explained variance, split by driver")
    ax.set_title("Which weather drivers matter"); panel(ax, "b")
    ax.legend(ncol=3, fontsize=6.3, loc="upper center", bbox_to_anchor=(0.5, -0.38))
    fig.tight_layout(w_pad=1.5)
    save(fig, "fig10_drivers")


# ---------------------------------------------------------------- Fig 11: event catalogue
def fig_events():
    ev = R["events"]["events"]
    fig, axs = plt.subplots(2, 1, figsize=(7.2, 5.0), gridspec_kw={"height_ratios": [2.4, 1]})
    ax = axs[0]
    ax.set_facecolor("#f4f6fa")
    for rid in CTRY:
        lon, lat, tot = region_cell_totals(rid)
        k = tot > 0
        ax.scatter(lon[k], lat[k], s=0.3, color="#d9dce4", marker="s", lw=0, rasterized=True)
    for e in ev:
        ax.scatter(e["lon"], e["lat"], s=4 + e["excess"] / 900, color=CTRY.get(e["region"], C_HAR), alpha=0.55, lw=0.3, ec="white")
    notable = [("australia", 2019, 11, "Black Summer, Dec 2019"), ("canada", 2023, 8, "Canada, Sep 2023"),
               ("united_states", 2020, 8, "California, Sep 2020"), ("australia", 2003, 0, "Alpine fires, Jan 2003"), ("india", 2021, 2, "Uttarakhand, Mar 2021")]
    for rg, yr, m, lab in notable:
        e = [x for x in ev if x["region"] == rg and x["year"] == yr and x["month"] == m]
        if e:
            e = max(e, key=lambda x: x["excess"])
            ax.annotate(lab, (e["lon"], e["lat"]), xytext=(6, -10 if "Alpine" in lab else 4), textcoords="offset points", fontsize=6, color=INK,
                        arrowprops=dict(arrowstyle="-", lw=0.4, color=INK))
    ax.set_xlim(-170, 175); ax.set_ylim(-56, 72); ax.set_aspect("equal"); ax.grid(False)
    ax.tick_params(labelsize=6); ax.set_title(f"{len(ev)} extreme fire-months found automatically (size = excess FCD)"); panel(ax, "a")
    ax = axs[1]
    yrs = np.arange(2001, 2026)
    bottom = np.zeros(len(yrs))
    for rid, col in CTRY.items():
        cnt = np.array([sum(1 for e in ev if e["region"] == rid and e["year"] == y) for y in yrs])
        ax.bar(yrs, cnt, bottom=bottom, color=col, width=0.8, label=R["regions"][rid]["name"].replace("United States", "USA"))
        bottom += cnt
    ax.set_ylabel("Events per year"); ax.set_title("By year and country"); ax.legend(fontsize=6.3, loc="upper left", ncol=5); panel(ax, "b")
    ax.set_xticks(range(2001, 2026, 2)); ax.set_ylim(0, 25)
    fig.tight_layout(h_pad=1.0)
    save(fig, "fig11_events")


# ---------------------------------------------------------------- Fig 12: outlook skill
def fig_outlook():
    ids = [("parana", "Paraná Delta"), ("chaco", "Gran Chaco"), ("punjab", "Punjab"), ("central", "Central India"),
           ("blacksummer", "NSW"), ("kimberley", "Top End"), ("kerala", "Kerala"), ("northeast", "NE India")]
    fig, ax = plt.subplots(figsize=(7.2, 2.3))
    pal = plt.get_cmap("tab10")
    for j, (cid, name) in enumerate(ids):
        o = [x for x in R["cases"][cid]["outlook"] if x]
        ax.plot([x["lead"] for x in o], [x["hitRate"] * 100 for x in o], marker="o", ms=3, lw=1.2, color=pal(j), label=name)
    ax.axhline(100 / 3, color=INK, lw=0.8, ls="--"); ax.text(6.05, 34.5, "chance (33%)", fontsize=6.5, color=INK)
    ax.set_xlabel("Lead time (months ahead)"); ax.set_ylabel("Tercile hit rate (%)")
    ax.set_title("Backtested 6-month outlook: leave-one-year-out hit rate in each area's fire months")
    ax.set_xlim(0.8, 6.9); ax.set_ylim(20, 75)
    ax.legend(ncol=4, fontsize=6.5, loc="upper right")
    save(fig, "fig12_outlook")


for f in (fig_workflow, fig_map, fig_seam, fig_k, fig_validation, fig_national, fig_calendars, fig_clocks,
          fig_punjab, fig_drivers, fig_events, fig_outlook):
    f(); print("ok", f.__name__)
