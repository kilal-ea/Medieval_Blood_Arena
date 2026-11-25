export class PerformanceMonitor {
  private frames = 0;
  private accumTime = 0;
  public fps = 60;

  public tick(dt: number): void {
    this.frames++;
    this.accumTime += dt;
    if (this.accumTime >= 0.5) {
      this.fps = Math.round(this.frames / this.accumTime);
      this.frames = 0;
      this.accumTime = 0;
    }
  }
}
