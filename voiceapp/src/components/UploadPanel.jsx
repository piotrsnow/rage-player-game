import { useCallback, useRef, useState } from 'react';

export default function UploadPanel({ onUpload }) {
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState('');
  const [gender, setGender] = useState('male');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.wav')) {
      setError('Only .wav files are supported');
      return;
    }
    setFile(f);
    setError(null);
    if (!name) {
      setName(f.name.replace(/\.wav$/i, '').replace(/[_-]/g, ' '));
    }
  }, [name]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer?.files?.[0];
    handleFile(f);
  }, [handleFile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !name.trim()) return;

    setUploading(true);
    setError(null);
    try {
      await onUpload(file, name.trim(), gender);
      setFile(null);
      setName('');
      setGender('male');
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel-elevated rounded-sm p-6">
      <h2 className="font-headline text-lg text-tertiary mb-1 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">upload_file</span>
        Upload Voice Sample
      </h2>
      <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
        Best quality with 6-15 second clean WAV recordings
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-all
          ${dragging
            ? 'border-primary/60 bg-primary/5'
            : 'border-outline-variant/30 hover:border-primary/30 bg-surface-container/40'
          }
          ${file ? 'border-primary/40' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".wav,audio/wav"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {file ? (
          <div className="text-on-surface">
            <span className="material-symbols-outlined text-2xl text-primary mb-1">audio_file</span>
            <p className="font-body text-sm">{file.name}</p>
            <p className="text-[10px] text-on-surface-variant mt-1">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
        ) : (
          <div className="text-on-surface-variant">
            <span className="material-symbols-outlined text-3xl mb-2">cloud_upload</span>
            <p className="font-body text-sm">Drop WAV file here or click to browse</p>
          </div>
        )}
      </div>

      {/* Name + Gender + Submit */}
      {file && (
        <div className="mt-4 flex flex-wrap gap-3 items-end animate-fade-in">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-1">
              Voice Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-surface-container px-3 py-2 rounded-sm text-on-surface font-body text-sm border border-outline-variant/30 focus:border-primary/50 outline-none"
              placeholder="e.g. Fronczewski"
            />
          </div>

          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-1">
              Gender
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`px-3 py-2 text-xs font-bold uppercase rounded-sm border transition-all ${
                  gender === 'male'
                    ? 'border-blue-400/50 text-blue-300 bg-blue-500/10'
                    : 'border-outline-variant/30 text-on-surface-variant'
                }`}
              >
                ♂ Male
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`px-3 py-2 text-xs font-bold uppercase rounded-sm border transition-all ${
                  gender === 'female'
                    ? 'border-pink-400/50 text-pink-300 bg-pink-500/10'
                    : 'border-outline-variant/30 text-on-surface-variant'
                }`}
              >
                ♀ Female
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={uploading || !name.trim()}
            className="px-5 py-2 bg-primary/15 text-primary font-bold text-xs uppercase tracking-widest rounded-sm border border-primary/30 hover:bg-primary/25 disabled:opacity-40 transition-all"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-error animate-fade-in">{error}</p>
      )}
    </form>
  );
}
