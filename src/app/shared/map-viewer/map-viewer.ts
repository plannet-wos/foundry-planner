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
  };

  ngAfterViewInit() {
    const el = this.content.nativeElement;
    el.addEventListener('touchstart', this._onTouchStart, { passive: false });
    el.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    el.addEventListener('touchend',   this._onTouchEnd,   { passive: true  });
  }

  ngOnDestroy() {
    const el = this.content?.nativeElement;
    if (el) {
      el.removeEventListener('touchstart', this._onTouchStart);
      el.removeEventListener('touchmove',  this._onTouchMove);
      el.removeEventListener('touchend',   this._onTouchEnd);
    }
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
