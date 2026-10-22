"use client";
import "./khero.css";
import type { CSSProperties } from "react";

export type KHeroProps = { name: string; tag: string; eyebrow: string; body: string; stat: string; primary: string; secondary: string; features: string[]; accent: string; image: string; target?: string; title?: string };

export function KHero({ name, tag, eyebrow, body, stat, primary, secondary, features, accent, image, target = "app", title }: KHeroProps) {
  const go = () => document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
  const t = (title ?? name).toUpperCase();
  const items = [...features, ...features];
  return <section className="kh" style={{ "--kh-accent": accent, "--kh-img": `url(${image})`, "--kh-len": t.length + 1 } as CSSProperties} aria-label={`${name} introduction`}>
    <div className="kh-bg" aria-hidden="true" />
    <header className="kh-nav">
      <span className="kh-mark">{name.toUpperCase()} <em>{tag}</em></span>
      <div className="kh-nav-r">
        <button className="kh-round" type="button" aria-label="Open the app" onClick={go}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg></button>
        <button className="kh-burger" type="button" aria-label="Menu: jump to the app" onClick={go}><span /><span /><span /></button>
      </div>
    </header>
    <i className="kh-c kh-tl" /><i className="kh-c kh-tr" /><i className="kh-c kh-bl" /><i className="kh-c kh-br" />
    <div className="kh-center">
      <p className="kh-eyebrow">{eyebrow}</p>
      <h1 className="kh-title">{t}</h1>
      <span className="kh-line" />
      <p className="kh-body">{body}</p>
      <p className="kh-stat">{stat}</p>
      <div className="kh-ctas">
        <button type="button" className="kh-btn kh-out" onClick={go}>{secondary}</button>
        <button type="button" className="kh-btn kh-solid" onClick={go}>{primary}</button>
      </div>
    </div>
    <button type="button" className="kh-scroll" onClick={go}>SCROLL<span /></button>
    <div className="kh-ribbon" aria-label="Features"><div className="kh-track">{items.map((f, i) => <span key={i} aria-hidden={i >= features.length}>{f}<b>✦</b></span>)}</div></div>
  </section>;
}
