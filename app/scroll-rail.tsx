"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import "./scroll-rail.css";

const tickCount = 37;
const ticks = Array.from({ length: tickCount }, (_, i) => i);

function scrollDistance() {
  const root = document.scrollingElement ?? document.documentElement;
  return Math.max(0, root.scrollHeight - root.clientHeight);
}

function moveToPercent(percent: number) {
  window.scrollTo({ top: scrollDistance() * percent / 100, behavior: "instant" });
}

export function ScrollRail({ lang }: { lang: "en" | "my" }) {
  const slider = useRef<HTMLInputElement>(null);
  const [activeTick, setActiveTick] = useState(-1);

  useEffect(() => {
    let frame = 0;
    function measure() {
      frame = 0;
      const distance = scrollDistance();
      const percent = distance ? Math.max(0, Math.min(100, 100 * window.scrollY / distance)) : 0;
      if (slider.current) slider.current.value = percent.toFixed(1);
      setActiveTick(distance > 0 ? Math.round(percent * (tickCount - 1) / 100) : -1);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Vertical range arrow conventions differ from scrolling a document.
    const page = document.documentElement.clientHeight;
    const steps: Record<string, number> = { ArrowDown: 80, ArrowUp: -80, PageDown: page, PageUp: -page };
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveToPercent(event.key === "Home" ? 0 : 100);
    } else if (Object.hasOwn(steps, event.key)) {
      event.preventDefault();
      window.scrollBy({ top: steps[event.key], behavior: "instant" });
    }
  }

  return (
    <div className="scroll-rail" hidden={activeTick < 0}>
      <div className="scroll-rail-ticks" aria-hidden="true">
        {ticks.map(i => <span key={i} className={i === activeTick ? "current" : Math.abs(i - activeTick) === 1 ? "nearby" : undefined} />)}
      </div>
      <input ref={slider} type="range" min={0} max={100} step={0.1} defaultValue={0}
        aria-label={lang === "my" ? "စာမျက်နှာပေါ်ရှိ နေရာ" : "Page scroll position"}
        aria-orientation="vertical"
        onChange={event => moveToPercent(event.currentTarget.valueAsNumber)}
        onKeyDown={onKeyDown} />
    </div>
  );
}
