import {
  AfterViewInit, Component, computed, ElementRef,
  HostListener, Input, OnDestroy, signal, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-map-viewer',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './map-viewer.html',
  styleUrl:    './map-viewer.scss'
})
export class MapViewer implements AfterViewInit, OnDestroy {
  @Input() src = '/battlemap.png';

  @ViewChild('wrapper') wrapper!: ElementRef<HTMLElement>;
  @ViewChild('content') content!: ElementRef<HTMLElement>;
  @ViewChild('overlay') overlay!: ElementRef<HTMLElement>;

  readonly scale        = signal(1);
  readonly translateX   = signal(0);
  readonly translateY   = signal(0);
  readonly isFullscreen = signal(false);

  readonly transformStyle = computed(() => {
    const s = this.scale(), tx = this.translateX(), ty = this.translateY();
    if (s === 1 && tx === 0 && ty === 0) return 'none';
    return `translate(${tx}px, ${ty}px) scale(${s})`;
  });

  readonly supportsFullscreen = !!(
    document.documentElement.requestFullscreen ||
    (document.documentElement as any).webkitRequestFullscreen
  );

  private lastTouchDist = 0;
  private isPanning     = false;
  private panStartX     = 0;
  private panStartY     = 0;

  // Arrow-function properties so removeEventListener works correctly
  private readonly _onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      this.lastTouchDist = this.touchDist(e);
      this.isPanning = false;
    } else if (e.touches.length === 1 && this.scale() > 1) {
      this.isPanning = true;
      this.panStartX = e.touches[0].clientX - this.translateX();
      this.panStartY = e.touches[0].clientY - this.translateY();
    }
  };

  private readonly _onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist  = this.touchDist(e);
      const ratio = dist / this.lastTouchDist;
      const s     = Math.min(5, Math.max(1, this.scale() * ratio));
      this.scale.set(s);
      this.lastTouchDist = dist;
      if (s === 1) { this.translateX.set(0); this.translateY.set(0); }
    } else if (e.touches.length === 1 && this.isPanning) {
      e.preventDefault();
      this.translateX.set(e.touches[0].clientX - this.panStartX);
      this.translateY.set(e.touches[0].clientY - this.panStartY);
    }
  };

  private readonly _onTouchEnd = () => {
    this.isPanning = false;
    if (this.scale() <= 1) {
      this.scale.set(1);
      this.translateX.set(0);
      this.translateY.set(0);
    }
    this.scheduleFitTooltips();
  };

  // Pin tooltips (`.pin-tooltip`, projected by the pages) sit above their pin
  // by default, but the wrapper clips with overflow:hidden, so a tooltip on a
  // pin near an edge would be cut off. Whenever one becomes visible (hover/tap)
  // or the map changes, flip it below the pin if there's more room there and
  // shift it back inside the visible frame.
  private readonly _onPinPointer = (e: Event) => {
    const pin = (e.target as HTMLElement).closest?.('.map-pin');
    pin?.querySelectorAll<HTMLElement>('.pin-tooltip').forEach(t => this.fitTooltip(t));
  };

  private fitFrame = 0;
  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;

  private scheduleFitTooltips() {
    if (this.fitFrame) return;
    this.fitFrame = requestAnimationFrame(() => {
      this.fitFrame = 0;
      this.overlay?.nativeElement
        .querySelectorAll<HTMLElement>('.pin-tooltip')
        .forEach(t => this.fitTooltip(t));
    });
  }

  private fitTooltip(tip: HTMLElement) {
    tip.classList.remove('below');
    tip.style.setProperty('--tip-dx', '0px');
    tip.style.setProperty('--tip-dy', '0px');
    if (tip.getClientRects().length === 0) return; // not displayed

    const pad   = 4;
    const frame = this.wrapper.nativeElement.getBoundingClientRect();
    const pin   = tip.parentElement!.getBoundingClientRect();
    let r = tip.getBoundingClientRect();

    if (r.top < frame.top + pad && frame.bottom - pin.bottom > pin.top - frame.top) {
      tip.classList.add('below');
      r = tip.getBoundingClientRect();
    }

    let dx = 0, dy = 0;
    if (r.right  > frame.right  - pad) dx = frame.right  - pad - r.right;
    if (r.left + dx < frame.left + pad) dx = frame.left + pad - r.left;
    if (r.bottom > frame.bottom - pad) dy = frame.bottom - pad - r.bottom;
    if (r.top  + dy < frame.top  + pad) dy = frame.top  + pad - r.top;

    // Offsets are applied inside the zoomed content (and the pin's own hover
    // scale), so convert screen px back to the tooltip's local px.
    const s = r.width / tip.offsetWidth || 1;
    tip.style.setProperty('--tip-dx', `${dx / s}px`);
    tip.style.setProperty('--tip-dy', `${dy / s}px`);
  }

  ngAfterViewInit() {
    const el = this.content.nativeElement;
    el.addEventListener('touchstart', this._onTouchStart, { passive: false });
    el.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    el.addEventListener('touchend',   this._onTouchEnd,   { passive: true  });

    const overlay = this.overlay.nativeElement;
    overlay.addEventListener('mouseover', this._onPinPointer);
    overlay.addEventListener('click',     this._onPinPointer);
    // Pins scale up on hover/select with a transition; refit once it settles.
    overlay.addEventListener('transitionend', this._onPinPointer);
    this.resizeObserver = new ResizeObserver(() => this.scheduleFitTooltips());
    this.resizeObserver.observe(this.wrapper.nativeElement);
    this.mutationObserver = new MutationObserver(() => this.scheduleFitTooltips());
    this.mutationObserver.observe(overlay, { childList: true, subtree: true, characterData: true });
    this.scheduleFitTooltips();
  }

  ngOnDestroy() {
    const el = this.content?.nativeElement;
    if (el) {
      el.removeEventListener('touchstart', this._onTouchStart);
      el.removeEventListener('touchmove',  this._onTouchMove);
      el.removeEventListener('touchend',   this._onTouchEnd);
    }
    const overlay = this.overlay?.nativeElement;
    if (overlay) {
      overlay.removeEventListener('mouseover', this._onPinPointer);
      overlay.removeEventListener('click',     this._onPinPointer);
      overlay.removeEventListener('transitionend', this._onPinPointer);
    }
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    if (this.fitFrame) cancelAnimationFrame(this.fitFrame);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  toggleFullscreen() {
    const el = this.wrapper.nativeElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen?.() ?? (el as any).webkitRequestFullscreen?.())?.catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  resetZoom() {
    this.scale.set(1);
    this.translateX.set(0);
    this.translateY.set(0);
    this.scheduleFitTooltips();
  }

  @HostListener('document:fullscreenchange')
  @HostListener('document:webkitfullscreenchange')
  onFullscreenChange() {
    this.isFullscreen.set(!!document.fullscreenElement);
    if (!this.isFullscreen()) this.resetZoom();
  }

  private touchDist(e: TouchEvent): number {
    const [t1, t2] = [e.touches[0], e.touches[1]];
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }
}
