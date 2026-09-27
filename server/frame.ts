export class Frame {
  private readonly imageIndex: number;
  // Clips are in CellData.ANIMATION_STEP units, capped so content isn't drawn off-screen.
  private readonly topClip: number;
  private readonly rightClip: number;
  private readonly bottomClip: number;
  private readonly leftClip: number;

  constructor(imageIndex: number, topClip: number, rightClip: number, bottomClip: number, leftClip: number) {
    this.imageIndex = imageIndex;
    this.topClip = Math.min(topClip, 2);
    this.rightClip = Math.min(rightClip, 2);
    this.bottomClip = Math.min(bottomClip, 2);
    this.leftClip = Math.min(leftClip, 2);
  }

  getImageIndex(): number {
    return this.imageIndex;
  }

  getTopClip(): number {
    return this.topClip;
  }

  getRightClip(): number {
    return this.rightClip;
  }

  getBottomClip(): number {
    return this.bottomClip;
  }

  getLeftClip(): number {
    return this.leftClip;
  }
}
