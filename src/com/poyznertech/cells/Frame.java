package com.poyznertech.cells;

public class Frame {
	private final int imageIndex;
	
	//Clips are in ANIMATION_STEPs
	private final int topClip;
	private final int rightClip;
	private final int bottomClip;
	private final int leftClip;
	
	public Frame(int imageIndex, int topClip, int rightClip, int bottomClip, int leftClip) {
		this.imageIndex = imageIndex;
		
		//We put a max on the values so it's not drawn off-screen, can be avoided with clip code in the JS?
		this.topClip = Math.min(topClip, 2);
		this.rightClip = Math.min(rightClip, 2);
		this.bottomClip = Math.min(bottomClip, 2);
		this.leftClip = Math.min(leftClip, 2);
	}

	public int getImageIndex() {
		return imageIndex;
	}

	public int getTopClip() {
		return topClip;
	}

	public int getRightClip() {
		return rightClip;
	}

	public int getBottomClip() {
		return bottomClip;
	}

	public int getLeftClip() {
		return leftClip;
	}
}
