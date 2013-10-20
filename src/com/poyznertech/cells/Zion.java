package com.poyznertech.cells;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

public class Zion {
	private final World world;
	private Map<String, Session> hardlines;
	private final List<Engine> matrix;
	private final Random random;
	private final Set<String> staleLogins;
	
	public Zion(World world) {
		this.world = world;
		hardlines = new HashMap<String, Session>();
		matrix = new ArrayList<Engine>();
		random = new Random();
		staleLogins = new HashSet<String>();
		
		addCell();
		addCell();
		addCell();
		addCell();
		addCell();
	}
	
	final void addCell() {
		Engine engine = new Engine(new Cell(world));
		matrix.add(engine);
		engine.getCell().init();
		engine.start();
	}
	
	public Map<String, Session> getHardlines() {
		return hardlines;
	}
	
	public final Engine getRandomEngine() {
		return matrix.get(random.nextInt(matrix.size()));
	}
	
	public final void loginNeedsRefresh(String login) {
		staleLogins.add(login);
	}
	
	public final void loginNotStale(String login) {
		if (stale(login)) {
			staleLogins.remove(login);
		}
	}
	
	public final boolean stale(String login) {
		return staleLogins.contains(login);
	}
}
