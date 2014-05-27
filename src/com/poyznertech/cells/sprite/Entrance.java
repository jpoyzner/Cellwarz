package com.poyznertech.cells.sprite;

import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.cell.Cell;

public abstract class Entrance extends Sprite {
	public Entrance(int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		super(x, y, cellInit, cell);
	}
	
	public final int getEntranceX() {
		return getX() + getEntranceXOffest();
	}
	
	public final int getEntranceY() {
		return getY() + getEntranceYOffset();
	}
	
	abstract int getEntranceXOffest();
	abstract int getEntranceYOffset();
}
