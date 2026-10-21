import { AbsoluteFill, Img, staticFile } from 'remotion';

const ink = '#252722';
const paper = '#f5f4f0';
const secondary = '#686b62';
const line = '#d8dad1';
const face = 'Arial, Helvetica, sans-serif';

/** @param {{children: import('react').ReactNode, number: number, note?: string}} props */
function Canvas({ children, number, note = 'Current iPhone UI · Isolated sample profile' }) {
  return (
    <AbsoluteFill style={{ background: paper, color: ink, fontFamily: face, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 48,
          top: 32,
          fontSize: 25,
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        myself.md
      </div>
      {children}
      <div
        style={{
          position: 'absolute',
          left: 48,
          right: 48,
          bottom: 27,
          borderTop: `1px solid ${line}`,
          paddingTop: 15,
          display: 'flex',
          justifyContent: 'space-between',
          color: secondary,
          fontSize: 15,
        }}
      >
        <span>{note}</span>
        <span>0{number} / 05</span>
      </div>
    </AbsoluteFill>
  );
}

/** @param {{title: string}} props */
function Copy({ title }) {
  return (
    <h1
      style={{
        position: 'absolute',
        left: 48,
        top: 105,
        width: 760,
        margin: 0,
        fontSize: 44,
        letterSpacing: -1.8,
        lineHeight: 1.1,
      }}
    >
      {title}
    </h1>
  );
}

/** Complete, unmodified capture in a simple device outline. @param {{src: string, left?: number}} props */
function Phone({ src, left = 908 }) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: 28,
        width: 310,
        padding: 6,
        background: '#242622',
        border: '1px solid #86897d',
        borderRadius: 42,
        boxSizing: 'border-box',
        boxShadow: '0 17px 30px #25272214',
      }}
    >
      <Img
        src={staticFile(`product-hunt/mobile-v2/${src}`)}
        style={{ width: '100%', display: 'block', borderRadius: 35 }}
      />
    </div>
  );
}

/** Enlarged crop of the same screenshot. @param {{src: string, top: number, left?: number, width?: number, height?: number, y?: number}} props */
function Detail({ src, top, left = -15, width = 740, height = 430, y = 206 }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 48,
        top: y,
        width: 710,
        height,
        overflow: 'hidden',
        border: `1px solid ${line}`,
        borderRadius: 20,
        background: '#fff',
      }}
    >
      <Img
        src={staticFile(`product-hunt/mobile-v2/${src}`)}
        style={{ position: 'absolute', width, maxWidth: 'none', top, left }}
      />
    </div>
  );
}

function Cover() {
  return (
    <Canvas number={1} note="Sample iPhone profile · Mobile downloads coming soon">
      <h1
        style={{
          position: 'absolute',
          left: 48,
          top: 248,
          width: 310,
          margin: 0,
          fontSize: 48,
          letterSpacing: -2,
          lineHeight: 1.08,
        }}
      >
        Your data.
        <br />
        Your permissions.
      </h1>
      <Phone src="profile.png" left={460} />
      <Phone src="permissions-approved.png" />
    </Canvas>
  );
}

function Selection() {
  return (
    <Canvas number={2}>
      <Copy title="Choose your data." />
      <Detail src="selection.png" top={-840} left={-40} width={790} height={380} />
      <Phone src="selection.png" />
    </Canvas>
  );
}

function Private() {
  return (
    <Canvas number={3}>
      <Copy title="Selected. Still private." />
      <Detail src="permissions-private.png" top={-548} height={500} y={185} />
      <Phone src="permissions-private.png" />
    </Canvas>
  );
}

function Approval() {
  return (
    <Canvas number={4} note="Sample profile · App approval is separate from iOS permissions">
      <Copy title="Approve agent access." />
      <Detail src="confirmation.png" top={-785} left={-74} width={860} height={380} />
      <Phone src="confirmation.png" />
    </Canvas>
  );
}

function Approved() {
  return (
    <Canvas number={5} note="Sample profile · Reads require pairing and OS permissions">
      <Copy title="Health only. Your choice." />
      <Detail src="permissions-approved.png" top={-548} height={500} y={185} />
      <Phone src="permissions-approved.png" />
    </Canvas>
  );
}

const scenes = [Cover, Selection, Private, Approval, Approved];

/** @param {{slide: number}} props */
export function ProductHuntGallery({ slide }) {
  const Scene = scenes[slide - 1];
  if (!Scene) throw new Error(`Unknown Product Hunt slide: ${slide}`);
  return <Scene />;
}

export function ProductHuntThumbnail() {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Img src={staticFile('product-hunt/icon.png')} style={{ width: '100%', height: '100%' }} />
    </AbsoluteFill>
  );
}

export function ProductHuntOverview() {
  return (
    <AbsoluteFill
      style={{
        background: '#e9e8e2',
        fontFamily: face,
        color: ink,
        padding: 26,
        gap: 20,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'repeat(3, 365px)',
      }}
    >
      {scenes.map((Scene) => (
        <div key={Scene.name} style={{ position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              width: 1270,
              height: 760,
              transform: 'scale(0.472)',
              transformOrigin: 'top left',
              position: 'relative',
            }}
          >
            <Scene />
          </div>
        </div>
      ))}
      <div
        style={{ padding: 35, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      >
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>myself.md</div>
        <div style={{ fontSize: 22, marginTop: 22, lineHeight: 1.4 }}>
          Product Hunt gallery v2
          <br />
          Current iPhone screens
          <br />
          Local preparation only
        </div>
      </div>
    </AbsoluteFill>
  );
}
