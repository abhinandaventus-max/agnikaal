import json, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LogNorm
R = json.load(open('results.json'))
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 8.5, 'axes.spines.top': False, 'axes.spines.right': False,
                     'axes.titlesize': 9, 'axes.titleweight': 'bold', 'savefig.dpi': 220, 'axes.labelsize': 8.5, 'legend.frameon': False})
C_RAW, C_H, C_M, C_V = '#d9480f', '#1c3d6e', '#7048e8', '#1098ad'
MON = 'JFMAMJJASOND'
yrs = np.arange(2001, 2026)

# F1 seam
fig, axs = plt.subplots(1, 5, figsize=(10.2, 2.3))
for ax, r in zip(axs, R['regions']):
    raw = np.array([r['rawSplice'][str(y)] for y in yrs]) / 1e3
    h = np.array([r['harm'][str(y)] for y in yrs]) / 1e3
    ax.axvspan(2000.5, 2011.5, color='#f1f3f5', zorder=0)
    ax.plot(yrs, raw, color=C_RAW, ls='--', lw=1.3, label='Raw splice (detections)')
    ax.plot(yrs, h, color=C_H, lw=1.8, label='Harmonized (VIIRS-eq. FCD)')
    ax.axvline(2011.5, color='#868e96', lw=0.8, ls=':')
    ax.set_title(f"{r['name']}\nraw step ×{r['stepRaw']:.1f} → ×{r['stepHarm']:.2f}", fontsize=8.5)
    ax.set_xticks([2005, 2015, 2025]); ax.set_ylim(bottom=0)
axs[0].set_ylabel('Annual total (thousands)')
axs[0].text(2006, axs[0].get_ylim()[1]*0.92, 'MODIS era', ha='center', fontsize=7, color='#868e96')
fig.legend(*axs[0].get_legend_handles_labels(), loc='lower center', ncol=2, bbox_to_anchor=(0.5, -0.06))
fig.tight_layout(rect=(0, 0.06, 1, 1)); fig.savefig('fig/f1_seam.png', bbox_inches='tight'); plt.close()

# F2 k by month
fig, ax = plt.subplots(figsize=(5.0, 2.6))
cols = ['#1c3d6e', '#d9480f', '#2b8a3e', '#7048e8', '#e67700']
for c, r in zip(cols, R['regions']):
    k, sd = np.array(r['k']), np.array(r['sd'])
    ax.plot(range(12), k, marker='o', ms=3, color=c, lw=1.4, label=f"{r['name']} (pooled {r['kAll']:.2f})")
    ax.fill_between(range(12), np.maximum(k - sd, 0), k + sd, color=c, alpha=0.08)
ax.set_xticks(range(12)); ax.set_xticklabels(list(MON)); ax.set_ylabel('k̂ₘ  (VIIRS FCD / MODIS FCD)'); ax.set_ylim(0, None)
ax.legend(fontsize=7, ncol=1, loc='upper left', bbox_to_anchor=(1.0, 1.0))
fig.tight_layout(); fig.savefig('fig/f2_k.png', bbox_inches='tight'); plt.close()

# F3 LOYO scatter
fig, axs = plt.subplots(1, 2, figsize=(7.4, 3.1), sharex=True, sharey=True)
for c, r in zip(cols, R['regions']):
    d = json.load(open(f"loyo_{r['id']}.json"))
    o, p = np.array(d['obs']) + 1, np.array(d['pred']) + 1
    no, npd = np.array(d['nobs']) + 1, np.array(d['npred']) + 1
    axs[0].scatter(no, npd, s=5, color=c, alpha=0.5, lw=0)
    axs[1].scatter(o, p, s=5, color=c, alpha=0.55, lw=0, label=r['name'])
for ax, t in zip(axs, ['(a) Naive splice: raw MODIS vs raw VIIRS', '(b) Agnikaal, leave-one-year-out prediction']):
    ax.set_xscale('log'); ax.set_yscale('log'); lim = (1, 3e5); ax.plot(lim, lim, color='#495057', lw=0.8, ls='--'); ax.set_xlim(lim); ax.set_ylim(lim)
    ax.set_title(t, fontsize=8.5); ax.set_xlabel('Observed VIIRS (monthly, +1)')
axs[0].set_ylabel('MODIS-based estimate (+1)')
axs[1].legend(fontsize=7, markerscale=2.5, loc='upper left')
fig.tight_layout(); fig.savefig('fig/f3_loyo.png', bbox_inches='tight'); plt.close()

# F4 calendars
A = {a['id']: a for a in R['aois']}
fig, axs = plt.subplots(1, 2, figsize=(7.6, 3.6))
for ax, key, t in zip(axs, ['punjab', 'blacksummer'], ['(a) Punjab–Haryana stubble belt', '(b) New South Wales (Black Summer)']):
    m = np.array([[np.nan if v is None else v for v in row] for row in A[key]['calendar']], float)
    im = ax.imshow(m + 1, aspect='auto', cmap='inferno', norm=LogNorm(vmin=1, vmax=np.nanmax(m) + 1), extent=(-0.5, 11.5, 2025.5, 2000.5))
    ax.axhline(2011.5, color='white', lw=0.9, ls='--'); ax.set_xticks(range(12)); ax.set_xticklabels(list(MON)); ax.set_title(t, fontsize=8.5)
    ax.set_yticks([2001, 2005, 2010, 2015, 2020, 2025]); ax.spines[:].set_visible(False)
    cb = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.02); cb.set_label('Harmonized FCD (+1, log)', fontsize=7); cb.ax.tick_params(labelsize=6.5)
fig.tight_layout(); fig.savefig('fig/f4_calendar.png', bbox_inches='tight'); plt.close()

# F5 ablation
ids = ['punjab', 'central', 'northeast', 'kerala', 'chaco', 'parana', 'blacksummer', 'kimberley', 'california', 'quebec']
lab = ['Punjab', 'C. India', 'NE India', 'Kerala', 'Chaco', 'Paraná', 'NSW', 'Top End', 'California', 'Québec']
var = [('pooled', 'Single pooled ratio', '#adb5bd'), ('raw_counts_eb25', 'Monthly, raw detections', '#f59f00'), ('monthly_noshrink', 'Monthly FCD, no shrinkage', '#74c0fc'), ('monthly_eb25', 'Monthly FCD + EB shrinkage (Agnikaal)', '#1c3d6e')]
fig, ax = plt.subplots(figsize=(7.6, 2.6)); w = 0.2; x = np.arange(len(ids))
for j, (k, l, c) in enumerate(var):
    vals = [A[i]['abl'][k]['mape'] for i in ids]; vals = [v if v is not None and np.isfinite(v) and v < 150 else np.nan for v in vals]
    ax.bar(x + (j - 1.5) * w, vals, w, color=c, label=l)
    for xi, v in zip(x, vals):
        if np.isnan(v): ax.text(xi + (j - 1.5) * w, 3, '×', ha='center', color='#c92a2a', fontsize=9, fontweight='bold')
ax.set_xticks(x); ax.set_xticklabels(lab, fontsize=7.5); ax.set_ylabel('LOYO MAPE (%)'); ax.legend(fontsize=7, ncol=2, loc='upper left')
fig.tight_layout(); fig.savefig('fig/f5_ablation.png', bbox_inches='tight'); plt.close()

# F6 season profiles
fig, axs = plt.subplots(2, 5, figsize=(10.2, 3.3), sharex=True)
for ax, i, l in zip(axs.flat, ids, lab):
    med = np.array(A[i]['climMed']); s = med / med.sum() * 100 if med.sum() else med
    ax.bar(range(12), s, color=['#d9480f' if MON[m] and A[i]['critical'].count(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m]) else '#ced4da' for m in range(12)], width=0.8)
    ax.set_title(l, fontsize=8); ax.set_xticks(range(12)); ax.set_xticklabels(list(MON), fontsize=6.5); ax.tick_params(axis='y', labelsize=6.5)
for ax in axs[:, 0]: ax.set_ylabel('% of year', fontsize=7.5)
fig.tight_layout(); fig.savefig('fig/f6_season.png', bbox_inches='tight'); plt.close()
print('ok')
