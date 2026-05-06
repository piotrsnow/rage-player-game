export default function VideoBackground({ src, opacity = 0.5 }) {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={src}
        autoPlay
        loop
        muted
        playsInline
      />
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${1 - opacity})` }} />
    </div>
  );
}
