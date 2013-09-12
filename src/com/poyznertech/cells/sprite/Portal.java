package com.poyznertech.cells.sprite;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Zion;

public class Portal extends CryogenicDoor {
	public Portal(int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		super(x, y, cellInit, cell);
	}
	
	final void warpRandomly(Avatar avatar) {
		Zion zion = cell.getWorld().getZion();
		zion.getRandomEngine().getCell().connect(avatar.getName(), true);
		zion.loginNeedsRefresh(avatar.getName());
	}
}
