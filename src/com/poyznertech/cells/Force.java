package com.poyznertech.cells;

public class Force {
	private final int xDirection;
	private final int yDirection;
	private final int mass;
	
	public Force(int xDirection, int yDirection, int mass) {
		this.xDirection = xDirection;
		this.yDirection = yDirection;
		this.mass = mass;
	}

	public final int getxDirection() {
		return xDirection;
	}

	public final int getyDirection() {
		return yDirection;
	}

	public final int getMass() {
		return mass;
	}
}
