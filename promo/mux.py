"""Mix narration + ambient bed and encode the final MP4s.
Usage: python3 promo/mux.py <render_dir> <out_dir>
Produces: agnikaal-intro-youtube-1080p.mp4, agnikaal-intro-web.mp4, agnikaal-intro.srt, thumbnail."""
import json, os, subprocess, sys

R, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
sc = json.load(open(os.path.join(R, "scenes.json")))
total, scenes = sc["total"], sc["scenes"]
timing = {t["id"]: t for t in json.load(open(os.path.join(HERE, "timing.json")))}


def run(args):
    print(" ".join(a if len(a) < 80 else a[:80] + "…" for a in args))
    subprocess.run(args, check=True)


# 1) narration track: each scene clip delayed to its start
inputs, filt, labels = [], [], []
for i, s in enumerate(scenes):
    inputs += ["-i", s["file"]]
    ms = int(s["start"] * 1000)
    filt.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{i}]")
    labels.append(f"[v{i}]")
n = len(scenes)
# 2) ambient bed: soft A-minor pad with slow swells, filtered and faded
bed = ("aevalsrc='0.10*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.05*t))"
       "+0.07*sin(2*PI*164.81*t)*(0.6+0.4*sin(2*PI*0.07*t+1))"
       "+0.06*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.043*t+2))"
       "+0.035*sin(2*PI*329.63*t)*(0.5+0.5*sin(2*PI*0.09*t))"
       "+0.025*sin(2*PI*440*t)*(0.5+0.5*sin(2*PI*0.031*t+0.5))'"
       f":s=48000:d={total:.2f}")
filt.append(f"{bed},lowpass=f=1400,aecho=0.8:0.7:120|240:0.25|0.15,afade=t=in:d=2.5,afade=t=out:st={total-3.5:.2f}:d=3.5,volume=0.30,aformat=channel_layouts=stereo[bed]")
filt.append("".join(labels) + f"amix=inputs={n}:normalize=0:dropout_transition=0,volume=1.0[voice]")
filt.append("[voice][bed]amix=inputs=2:normalize=0,alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11[out]")
wav = os.path.join(R, "mix.wav")
run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filt), "-map", "[out]", "-t", f"{total:.2f}", "-ar", "48000", wav])

# 3) YouTube master: 1080p30, high bitrate, clean (no burned captions)
yt = os.path.join(OUT, "agnikaal-intro-youtube-1080p.mp4")
run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(R, "video-clean-silent.mp4"), "-i", wav,
     "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", "-shortest", yt])

# 4) Web intro: 720p, burned captions (plays muted on autoplay), small file
web = os.path.join(OUT, "agnikaal-intro-web.mp4")
run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(R, "video-cc-silent.mp4"), "-i", wav,
     "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest", web])

# 5) SRT captions for YouTube upload
def ts(x):
    h, m = int(x // 3600), int(x % 3600 // 60); s = x % 60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int((s % 1) * 1000):03d}"
import re
PRETTY = [(r"agni-kaal dot vercel dot app", "agnikaal.vercel.app"), (r"Agni-kaal", "Agnikaal"), (r"Akasha Seven", "AKASHA7"),
          (r"ninety-seven percent", "97%"), (r"seventy million", "70 million"), (r"twenty-five", "25")]
def pretty(t):
    for a, b in PRETTY:
        t = re.sub(a, b, t, flags=re.I)
    return t
lines, k = [], 1
for s in scenes:
    tm = timing[s["id"]]
    toks, ti, buf, st = tm["text"].split(), 0, [], None
    for i, w in enumerate(tm["words"]):
        n = len(w["w"].split()); got = toks[ti:ti + n]; ti += n
        st = w["t"] if st is None else st
        buf += got
        txt = " ".join(buf); last = got[-1] if got else ""
        if i == len(tm["words"]) - 1 or len(txt) > 40 or (last[-1:] in ".,:;?!" and len(txt) >= 16):
            lines.append(f"{k}\n{ts(s['start'] + st)} --> {ts(s['start'] + w['t'] + w['d'] + 0.2)}\n{pretty(txt)}\n")
            k += 1; buf, st = [], None
open(os.path.join(OUT, "agnikaal-intro.srt"), "w").write("\n".join(lines))

# 6) thumbnail + web poster
run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "4.2", "-i", os.path.join(R, "video-clean-silent.mp4"), "-frames:v", "1", "-q:v", "2", os.path.join(OUT, "agnikaal-youtube-thumbnail.jpg")])
run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "4.2", "-i", os.path.join(R, "video-clean-silent.mp4"), "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "4", os.path.join(OUT, "agnikaal-intro-poster.jpg")])
print("done")
