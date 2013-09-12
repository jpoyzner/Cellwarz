package com.poyznertech.cells.sprite;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.CellData;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Frame;
import com.poyznertech.cells.Physics;

public class Launcher extends Mana {
	static Map<String, List<Frame>> actionFrames = new HashMap<String, List<Frame>>();
	static int dashboardImageIndex;
	
	public static void init(CellData cellData) {
		addAction(cellData, DEFAULT_ACTION, "mana/launcher/launcher", 1, false, actionFrames);
		dashboardImageIndex = addImage(cellData, "mana/engine/control");
		Missile.init(cellData); //TODO: make these init methods called once only?
	}

	@Override
	public Map<String, List<Frame>> getActionFrames() {
		return actionFrames;
	}
	
	public Launcher(int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		super(x, y, cellInit, cell);
	}
	
	@Override
	List<ManaAction> addManaActions() {
		return Arrays.asList(new LaunchMissleLeft(), new LaunchMissleRight());
	}
	
	private class LaunchMissleLeft extends ManaAction {		
		@Override
		public void activate() {
			try {
				new Missile(getX(), getY() + 1, Physics.LEFT, cell);
			} catch (ClusteredInitException e) {}
		}
	}
	
	private class LaunchMissleRight extends ManaAction {
		@Override
		public void activate() {
			try {
				new Missile(getX(), getY() + 1, Physics.RIGHT, cell);
			} catch (ClusteredInitException e) {}
		}
	}

	@Override
	public int getDashboardImageIndex() {
		return dashboardImageIndex;
	}
}
