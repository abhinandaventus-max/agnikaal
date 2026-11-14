"""Generate the narration (Microsoft Edge neural voice) + word timings for captions.
Usage: python3 promo/voiceover.py <outdir>"""
import asyncio, json, os, subprocess, sys
import edge_tts

VOICE, RATE = "en-IN-NeerjaExpressiveNeural", os.environ.get("RATE", "+0%")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


async def one(item):
    comm = edge_tts.Communicate(item.get("say", item["text"]), VOICE, rate=RATE, boundary="WordBoundary")
    words, audio = [], bytearray()
    async for ch in comm.stream():
        if ch["type"] == "audio":
            audio.extend(ch["data"])
        elif ch["type"] == "WordBoundary":
            words.append({"w": ch["text"], "t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7})
    mp3 = os.path.join(OUT, f"{item['id']}.mp3")
    open(mp3, "wb").write(audio)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3]).strip())
    speech = (words[-1]["t"] + words[-1]["d"] + 0.3) if words else dur
    return {"id": item["id"], "text": item["text"], "file": mp3, "dur": min(dur, speech) if os.environ.get("TRIM") else dur, "words": words}


async def main():
    items = json.load(open(sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "narration.json")))
    res = [await one(i) for i in items]
    json.dump(res, open(os.path.join(OUT, "timing.json"), "w"), indent=1)
    for r in res:
        print(f"{r['id']:8s} {r['dur']:5.2f}s  {len(r['words'])} words")
    print("total", round(sum(r["dur"] for r in res), 1))

asyncio.run(main())
