import type { CSSProperties } from 'react';

// Each service keeps the same placement and motion as the catalog or language changes.
const edges = [
  { icon: 'chatgpt', edge: 'top', x: 11, peek: 16, angle: -17, scale: .88, dx: -3.6, dy: -4.2, sway: -5, duration: 5.3, delay: -2.3 },
  { icon: 'spotify', edge: 'top', x: 32, peek: 24, angle: -9, scale: 1.08, dx: 4.1, dy: -3.5, sway: 6, duration: 4.7, delay: -1.9 },
  { icon: 'claude', edge: 'top', x: 53, peek: 13, angle: 8, scale: .90, dx: 2.9, dy: -5.1, sway: -4, duration: 6.4, delay: -3.4 },
  { icon: 'canva-icon', edge: 'top', x: 72, peek: 22, angle: 16, scale: .97, dx: -3.3, dy: -4.7, sway: 5, duration: 6.9, delay: -5.1 },
  { icon: 'quillbot', edge: 'top', x: 91, peek: 16, angle: -21, scale: .84, dx: -4.7, dy: -3.9, sway: 4, duration: 7.7, delay: -6.3 },
  { icon: 'gemini', edge: 'bottom', x: 17, peek: 22, angle: 13, scale: 1.04, dx: 3.2, dy: 4.8, sway: 4, duration: 7.2, delay: -4.7 },
  { icon: 'netflix-icon', edge: 'bottom', x: 37, peek: 16, angle: 19, scale: .79, dx: -3.8, dy: 5.3, sway: -5, duration: 8.1, delay: -5.8 },
  { icon: 'adobe-creative-cloud', edge: 'bottom', x: 55, peek: 24, angle: -18, scale: .99, dx: -4.4, dy: 3.6, sway: 6, duration: 8.7, delay: -7.2 },
  { icon: 'capcut-icon', edge: 'bottom', x: 76, peek: 14, angle: -6, scale: .81, dx: 4.2, dy: 5.6, sway: -6, duration: 5.8, delay: -2.7 },
  { icon: 'duolingo', edge: 'bottom', x: 89, peek: 20, angle: 14, scale: .94, dx: 3.7, dy: 4.4, sway: -5, duration: 6.1, delay: -4.2 },
] as const;

export function ServiceTiles() {
  return <div className="service-sculptures" aria-hidden="true">
    {edges.map(mark => <span key={mark.icon} className="service-float" data-edge={mark.edge} style={{
      '--x': mark.x + '%', '--peek': mark.peek + 'px', '--angle': mark.angle + 'deg',
      '--scale': mark.scale, '--dx': mark.dx + 'px', '--dy': mark.dy + 'px',
      '--sway': mark.sway + 'deg', '--duration': mark.duration + 's', '--delay': mark.delay + 's',
    } as CSSProperties}>
      <span className="service-tile"><img src={'/assets/marks/' + mark.icon + '.svg'} width="23" height="23" alt="" draggable={false} /></span>
    </span>)}
  </div>;
}

export function OfferSculpture({ gift }: { gift: boolean }) {
  return <span className="offer-sculpture" data-gift={gift} aria-hidden="true">
    <img className="sculpture-portal" src="/assets/showcase/portal.webp" alt="" draggable={false} />
    {gift && <img className="sculpture-gift" src="/assets/showcase/gift.webp" alt="" draggable={false} />}
    <img className="sculpture-spark" src="/assets/showcase/spark.webp" alt="" draggable={false} />
  </span>;
}
