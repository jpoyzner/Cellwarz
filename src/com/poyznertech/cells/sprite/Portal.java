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
		//TODO: not sure why but if I use avatar.getSession() it causes NPEs
		zion.getHardlines().get(avatar.getName()).plugin(zion.getRandomEngine().getCell().addAvatarAtEntrance(avatar.getName()));
		zion.loginNeedsRefresh(avatar.getName());
	}
}
