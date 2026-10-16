import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { ImagePlus, Mic, MicOff, X } from "lucide-react";
import SafeImage from "./SafeImage";
import { resolveImageUrl } from "../lib/media";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SpeechRecognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

// Optional job photos + browser voice dictation that appends to the description (user reviews before publishing).
export default function JobMediaInputs({ images = [], onImages, onTranscript }) {
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => () => recRef.current?.stop(), []);

  const upload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (images.length + files.length > 6) return toast.error("Maximum 6 job images");
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("files", f));
      const res = await axios.post(`${API}/users/upload-job-images`, fd);
      onImages([...images, ...(res.data.urls || [])]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Image upload failed");
    }
    setUploading(false);
  };

  const toggleVoice = () => {
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (ev) => {
      const text = Array.from(ev.results).slice(ev.resultIndex).map(r => r[0].transcript).join(" ").trim();
      if (text) onTranscript(text);
    };
    rec.onerror = (ev) => { if (ev.error !== "aborted") toast.error("Voice input stopped: " + ev.error); };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <div className="space-y-2" data-testid="job-media-inputs">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || images.length >= 6}
          className="flex items-center gap-1.5 text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 hover:border-[#0000FF] disabled:opacity-50"
          data-testid="job-add-images-btn">
          <ImagePlus className="w-4 h-4" /> {uploading ? "Uploading..." : `Add photos (${images.length}/6)`}
        </button>
        {SpeechRecognition && (
          <button type="button" onClick={toggleVoice}
            className={`flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-2 border ${listening ? "bg-red-50 border-red-400 text-red-700 dark:bg-red-950 dark:text-red-300" : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-[#0000FF]"}`}
            data-testid="job-voice-btn">
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {listening ? "Stop dictation" : "Dictate description"}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={upload} data-testid="job-images-input" />
      </div>
      {listening && <p className="text-xs text-slate-500 dark:text-slate-400">Listening… speak your job description. Review the text before posting.</p>}
      {images.length > 0 && (
        <div className="grid grid-cols-6 gap-2">
          {images.map((url, i) => (
            <div key={url} className="relative aspect-square rounded-lg overflow-hidden">
              <SafeImage src={resolveImageUrl(url)} alt={`Job photo ${i + 1}`} className="w-full h-full" />
              <button type="button" onClick={() => onImages(images.filter(u => u !== url))}
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5" data-testid={`job-remove-image-${i}`}>
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
