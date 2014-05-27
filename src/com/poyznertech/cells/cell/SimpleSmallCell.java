package com.poyznertech.cells.cell;

import com.poyznertech.cells.World;

public class SimpleSmallCell extends Cell {
	public SimpleSmallCell(World world) {
		super(world);
	}

	@Override
	int getMinCellWidth() {
		return 800;
	}

	@Override
	int getMinCellHeight() {
		return 800;
	}

	@Override
	boolean usePortal() {
		return true;
	}

	@Override
	int getNumBoosters() {
		return 5;
	}

	@Override
	int getNumLaunchers() {
		return 10;
	}

	@Override
	int getNumIce() {
		return 1;
	}

	@Override
	int getNumRobots() {
		return 0;
	}
}
