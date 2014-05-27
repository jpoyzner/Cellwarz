package com.poyznertech.cells.sprite;

import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.cell.Cell;

public class Wall {
	public Wall(boolean vertical, int startX, int startY, int length, Cell cell) {
		int x = startX;
		int y = startY;
		for (int i = 0; i < length; i++) {
			try {
				new CellBlock(x, y, false,  cell);
			} catch (ClusteredInitException e) {}
			
			if (vertical) {
				y += CellBlock.SIZE;
			} else {
				x += CellBlock.SIZE;
			}
		}
	}
}
