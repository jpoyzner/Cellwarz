package com.poyznertech.cells;

import java.util.Random;

import com.poyznertech.cells.sprite.Avatar;
import com.poyznertech.cells.sprite.CellBlock;
import com.poyznertech.cells.sprite.CryogenicDoor;
import com.poyznertech.cells.sprite.EngineMana;
import com.poyznertech.cells.sprite.Entrance;
import com.poyznertech.cells.sprite.Launcher;
import com.poyznertech.cells.sprite.Mana;
import com.poyznertech.cells.sprite.Portal;
import com.poyznertech.cells.sprite.Robot;
import com.poyznertech.cells.sprite.Wall;

//TODO: message lines should be painted on screen on top left in a fixed position

public class Cell {
	private static final int CELL_WIDTH = 1152 / CellData.ANIMATION_STEP;
	private static final int CELL_HEIGHT = 896 / CellData.ANIMATION_STEP;
	private static final int OUTER_WALL_SIZE = CellBlock.SIZE * 4;
	
	private final World world;
	private final CellData cellData;
	private final Random random;
	private Engine engine;
	private Entrance entrance;
	//private Entrance entrance2;
	private Entrance portal;
	//private int robotCount = 0;
	
	private int newMessageEcho;
	private String message; //TODO: should be come list soon

	public Cell(World world) {
		this.world = world;
		cellData = new CellData(CELL_WIDTH, CELL_HEIGHT, world); 
		newMessageEcho = 0;
		random = new Random();
	}
	
	final Cell init() {
		Avatar.init(cellData);
		CellBlock.init(cellData);
		CryogenicDoor.init(cellData);
		EngineMana.init(cellData);
		Launcher.init(cellData);
		
		int wallWidth = CELL_WIDTH / CellBlock.SIZE;
		int wallHeight = CELL_HEIGHT / CellBlock.SIZE;
		
		///outer walls
		new Wall(false, CellBlock.SIZE, 0, wallWidth - CellBlock.SIZE, this);
		new Wall(false, CellBlock.SIZE, CellBlock.SIZE, wallWidth - CellBlock.SIZE, this);
		new Wall(false, CellBlock.SIZE, CellBlock.SIZE * 2, wallWidth - CellBlock.SIZE, this);
		new Wall(false, CellBlock.SIZE, CellBlock.SIZE * 3, wallWidth - CellBlock.SIZE, this);
		new Wall(true, CELL_WIDTH - CellBlock.SIZE, 0, wallHeight, this);
		new Wall(true, CELL_WIDTH - CellBlock.SIZE * 2, 0, wallHeight, this);
		new Wall(true, CELL_WIDTH - CellBlock.SIZE * 3, 0, wallHeight, this);
		new Wall(true, CELL_WIDTH - CellBlock.SIZE * 4, 0, wallHeight, this);
		new Wall(false, CellBlock.SIZE, CELL_HEIGHT - CellBlock.SIZE, wallWidth - CellBlock.SIZE, this);
		new Wall(false, CellBlock.SIZE, CELL_HEIGHT - CellBlock.SIZE * 2, wallWidth - CellBlock.SIZE, this);
		new Wall(false, CellBlock.SIZE, CELL_HEIGHT - CellBlock.SIZE * 3, wallWidth - CellBlock.SIZE, this);
		new Wall(false, CellBlock.SIZE, CELL_HEIGHT - CellBlock.SIZE * 4, wallWidth - CellBlock.SIZE, this);
		new Wall(true, 0, 0, wallHeight, this);
		new Wall(true, CellBlock.SIZE, 0, wallHeight, this);
		new Wall(true, CellBlock.SIZE * 2, 0, wallHeight, this);
		new Wall(true, CellBlock.SIZE * 3, 0, wallHeight, this);
		
		for (int i = 0; i < 20; i++) {
			int x = getRandomX(1);
			x = x % 2 == 0 ? x : (x - 1);
			int y = getRandomY(1);
			y = y % 2 == 0 ? y : (y - 1);
			boolean vertical = random.nextBoolean();
			
			new Wall(
				vertical,
				x,
				y,
				random.nextInt(vertical ? CELL_HEIGHT - y - OUTER_WALL_SIZE : CELL_WIDTH - x - OUTER_WALL_SIZE) / CellBlock.SIZE,
				this);
		}
		
		do {
			try {
				entrance = new CryogenicDoor(getRandomX(CryogenicDoor.WIDTH), getRandomY(CryogenicDoor.HEIGHT), true, this);
			} catch (ClusteredInitException e) {}
		} while (entrance == null);
		
		do {
			try {
				portal = new Portal(getRandomX(CryogenicDoor.WIDTH), getRandomY(CryogenicDoor.HEIGHT), true, this);
			} catch (ClusteredInitException e) {}
		} while (portal == null);
		
		//entrance2 = new CryogenicDoor(100, 90, world);
		
		for (int i = 0; i < 10; i++) {
			try {
				new EngineMana(getRandomX(Mana.SIZE), getRandomY(Mana.SIZE), true, this);
			} catch (ClusteredInitException e) {
				i--;
			}
		}
		
		for (int i = 0; i < 10; i++) {
			try {
				new Launcher(getRandomX(Mana.SIZE), getRandomY(Mana.SIZE), true, this);
			} catch (ClusteredInitException e) {
				i--;
			}
		}

		for (int i = 0; i < 10; i++) {
			try {
				new Robot(getRandomX(Avatar.WIDTH), getRandomY(Avatar.HEIGHT), true, this);
			} catch (ClusteredInitException e) {
				i--;
			}
		}
		
		return this;
	}
	
	private final int getRandomX(int spriteSize) {
		return OUTER_WALL_SIZE + random.nextInt(CELL_WIDTH - OUTER_WALL_SIZE * 2) - spriteSize + 1;
	}
	
	private final int getRandomY(int spriteSize) {
		return OUTER_WALL_SIZE + random.nextInt(CELL_HEIGHT - OUTER_WALL_SIZE * 2) - spriteSize + 1;
	}

	public CellData getCellData() {
		return cellData;
	}
	
	public final Avatar addAvatarAtEntrance(String name) {
		try {
			return new Avatar(name, entrance.getEntranceX(), entrance.getEntranceY(), false, this);
		} catch (ClusteredInitException e) {
			return null;
		}
	}
	
//	private final Avatar addRobotAtEntrance2() {
//		try {
//			return new Robot(entrance2.getEntranceX(), entrance2.getEntranceY(), false, world);
//		} catch (ClusteredInitException e) {
//			return null;
//		}
//	}
	
	final void process() {
		if (newMessageEcho != 0) {
			newMessageEcho--;
		}
	}

	public String getMessage() {
		return message;
	}

	public void postMessage(String message) {
		this.message = message;
		newMessageEcho = Engine.REDRAW_ECHO_FRAMES;
	}
	
	public boolean hasNewMessage() {
		return newMessageEcho != 0;
	}

	public World getWorld() {
		return world;
	}
	
	public Engine getEngine() {
		return engine;
	}
	
	public void setEngine(Engine engine) {
		this.engine = engine;
	}
}
