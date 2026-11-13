import type { CSSProperties } from 'react';

// Each service keeps the same placement and motion as the catalog or language changes.
const edges = [
  { icon: 'spotify', edge: 'top', at: 17, peek: 30, angle: -16, scale: 1.17, dx: 4.1, dy: -3.5, sway: 6, duration: 4.7, delay: -1.9 },
  { icon: 'claude', edge: 'top', at: 39, peek: 16, angle: 16, scale: .85, dx: 2.9, dy: -5.1, sway: -4, duration: 6.4, delay: -3.4 },
  { icon: 'canva-icon', edge: 'top', at: 79, peek: 34, angle: 23, scale: 1.04, dx: -3.3, dy: -4.7, sway: 5, duration: 6.9, delay: -5.1 },
  { icon: 'quillbot', edge: 'right', at: 22, peek: 17, angle: -22, scale: .91, dx: -4.7, dy: -3.9, sway: 4, duration: 7.7, delay: -6.3 },
  { icon: 'duolingo', edge: 'right', at: 51, peek: 18, angle: 14, scale: 1.12, dx: 3.7, dy: 4.4, sway: -5, duration: 6.1, delay: -4.2 },
  { icon: 'capcut-icon', edge: 'right', at: 66, peek: 12, angle: -9, scale: .89, dx: 4.2, dy: 5.6, sway: -6, duration: 5.8, delay: -2.7 },
  { icon: 'adobe-creative-cloud', edge: 'bottom', at: 71, peek: 23, angle: -23, scale: 1.12, dx: -4.4, dy: 3.6, sway: 6, duration: 8.7, delay: -7.2 },
  { icon: 'gemini', edge: 'bottom', at: 23, peek: 34, angle: 12, scale: 1.08, dx: 3.2, dy: 4.8, sway: 4, duration: 7.2, delay: -4.7 },
  { icon: 'netflix-icon', edge: 'left', at: 64, peek: 23, angle: 24, scale: .91, dx: -3.8, dy: 5.3, sway: -5, duration: 8.1, delay: -5.8 },
  { icon: 'chatgpt', edge: 'left', at: 28, peek: 23, angle: -14, scale: 1.02, dx: -3.6, dy: -4.2, sway: -5, duration: 5.3, delay: -2.3 },
] as const;

export function ServiceTiles() {
  return <div className="service-sculptures" aria-hidden="true">
    {edges.map(mark => <span key={mark.icon} className="service-float" data-edge={mark.edge} style={{
      '--at': mark.at + '%', '--peek': mark.peek + 'px', '--angle': mark.angle + 'deg',
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
