"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import "./scroll-rail.css";

const tickCount = 21;
const ticks = Array.from({ length: tickCount }, (_, i) => i);

function scrollDistance() {
  const root = document.scrollingElement ?? document.documentElement;
  return Math.max(0, root.scrollHeight - root.clientHeight);
}

function moveToPercent(percent: number) {
  window.scrollTo({ top: scrollDistance() * percent / 100, behavior: "instant" });
}

export function ScrollRail({ lang }: { lang: "en" | "my" }) {
  const rail = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const dragPointer = useRef<number | null>(null);
  const [activeTick, setActiveTick] = useState(-1);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let frame = 0;
    function measure() {
      frame = 0;
      const distance = scrollDistance();
      const percent = distance ? Math.max(0, Math.min(100, 100 * window.scrollY / distance)) : 0;
      if (slider.current) slider.current.value = percent.toFixed(1);
      setActiveTick(distance > 0 ? Math.round(percent * (tickCount - 1) / 100) : -1);

      const railElement = rail.current;
      if (!railElement || railElement.hidden) {
        if (distance > 0) schedule();
        return;
      }
      const railBounds = railElement.getBoundingClientRect();
      if (!railBounds.height) return;
      // These are the storefront's dark surfaces. Use exact neutral colors rather
      // than inversion, which would turn the navy backdrop into a yellow tint.
      const darkRegions = Array.from(document.querySelectorAll<HTMLElement>(".about, .showcase"), element => element.getBoundingClientRect());
      const onDarkSurface = (x: number, y: number) => darkRegions.some(bounds => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom);
      const tickBounds = Array.from(railElement.querySelectorAll<HTMLSpanElement>(".scroll-rail-ticks span"), tick => ({ tick, bounds: tick.getBoundingClientRect() }));
      // Read all geometry before painting, including when the rail crosses a section edge.
      for (const { tick, bounds } of tickBounds) {
        const surface = onDarkSurface((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2) ? "dark" : "light";
        if (tick.dataset.surface !== surface) tick.dataset.surface = surface;
      }
      const focusColor = onDarkSurface((railBounds.left + railBounds.right) / 2, (railBounds.top + railBounds.bottom) / 2) ? "#fff" : "#000";
      if (railElement.style.getPropertyValue("--rail-focus-color") !== focusColor) {
        railElement.style.setProperty("--rail-focus-color", focusColor);
      }
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

  function moveFromPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, (event.clientY - bounds.top) * 100 / bounds.height));
    if (slider.current) slider.current.value = percent.toFixed(1);
    setActiveTick(Math.round(percent * (tickCount - 1) / 100));
    moveToPercent(percent);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    // Capture the gesture so touch and mouse keep working outside the narrow rail.
    event.preventDefault();
    slider.current?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragPointer.current = event.pointerId;
    setDragging(true);
    moveFromPointer(event);
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragPointer.current !== event.pointerId) return;
    dragPointer.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

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
    <div ref={rail} className="scroll-rail" hidden={activeTick < 0} data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={event => { if (dragPointer.current === event.pointerId) moveFromPointer(event); }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={finishDrag}>
      <div className="scroll-rail-ticks" aria-hidden="true">
        {ticks.map(i => <span key={i} className={i === activeTick ? "current" : Math.abs(i - activeTick) === 1 ? "nearby" : Math.abs(i - activeTick) === 2 ? "approaching" : undefined} />)}
      </div>
      <input ref={slider} type="range" min={0} max={100} step={0.1} defaultValue={0}
        aria-label={lang === "my" ? "စာမျက်နှာပေါ်ရှိ နေရာ" : "Page scroll position"}
        aria-orientation="vertical"
        onChange={event => moveToPercent(event.currentTarget.valueAsNumber)}
        onKeyDown={onKeyDown} />
    </div>
  );
}
