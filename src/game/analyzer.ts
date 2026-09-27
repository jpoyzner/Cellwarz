export class Analyzer {
  state = '-BEGIN ANALYSIS-';
  connections = 0;
  redraws = 0;
  connectionTime = 0;
  drawTime = 0;

  private intervalId: ReturnType<typeof setInterval> | undefined;

  start(): void {
    this.intervalId = setInterval(() => this.recordState(), 1000);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private recordState(): void {
    this.state = `${this.connections} con, ${this.redraws} draws at ${this.drawTime}`;
    this.connections = 0;
    this.redraws = 0;
  }
}
