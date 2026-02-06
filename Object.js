// Simple Player class for a 2-player / vs CPU game
function _randInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _randomDivisorOf(n, minDiv = 2, maxDiv = 50) {
	const divisors = [];
	for (let i = minDiv; i <= Math.min(maxDiv, Math.abs(n)); i++) {
		if (i !== 0 && n % i === 0) divisors.push(i);
	}
	if (divisors.length === 0) return 1;
	return divisors[_randInt(0, divisors.length - 1)];
}

class Player {
	constructor(name, options = {}) {
		this.name = name || 'Player';
		this.maxHealth = options.maxHealth ?? 400;
		this.health = options.health ?? this.maxHealth;
		this.baseAttack = options.attack ?? 35;
		this.healsRemaining = options.heals ?? 2;
		this.isCPU = !!options.isCPU;

		// store pending generated problems per action
		this._pendingProblems = {}; // key -> { answer }
	}

	isAlive() {
		return this.health > 0;
	}

	receiveDamage(amount) {
		const dmg = Math.max(0, Math.floor(amount));
		this.health = Math.max(0, this.health - dmg);
		return dmg;
	}

	// Create a math problem for a requested action type
	// actionType: 'super' | 'effective' | 'notvery' | 'heal'
	generateProblemFor(actionType) {
		const type = actionType;
		let q = '';
		let ans = 0;

		if (type === 'super') {
			// difficult: (a * b) / c where a,b fairly large and c divides product
			const a = _randInt(20, 80);
			const b = _randInt(10, 50);
			const prod = a * b;
			const c = _randomDivisorOf(prod, 2, 50);
			q = `(${a} * ${b}) / ${c}`;
			ans = prod / c;
		} else if (type === 'effective') {
			// moderate: random choice of multiplication, division (integer), or subtraction
			const r = Math.random();
			if (r < 0.4) {
				const a = _randInt(12, 25);
				const b = _randInt(6, 18);
				q = `${a} * ${b}`;
				ans = a * b;
			} else if (r < 0.8) {
				const a = _randInt(10, 30);
				const b = _randInt(2, 10);
				const prod = a * b;
				q = `${prod} / ${b}`;
				ans = a;
			} else {
				const a = _randInt(100, 400);
				const b = _randInt(10, 99);
				q = `${a} - ${b}`;
				ans = a - b;
			}
		} else if (type === 'notvery') {
			// easy: addition or small subtraction
			if (Math.random() < 0.5) {
				const a = _randInt(1, 25);
				const b = _randInt(1, 25);
				q = `${a} + ${b}`;
				ans = a + b;
			} else {
				const a = _randInt(5, 40);
				const b = _randInt(1, Math.min(20, a - 1));
				q = `${a} - ${b}`;
				ans = a - b;
			}
		} else if (type === 'heal') {
			// moderate heal problem (similar to effective)
			const a = _randInt(12, 30);
			const b = _randInt(2, 15);
			q = `${a} * ${b}`;
			ans = a * b;
		} else {
			throw new Error('Unknown action type for problem generation');
		}

		// store pending answer keyed by timestamp to avoid simple replay issues
		const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
		this._pendingProblems[token] = { actionType: type, answer: ans };
		return { token, question: q };
	}

	// Attempt an action by submitting the token and an answer. If correct, perform the action.
	// For attacks: target required. Returns result object describing success/failure and effects.
	attemptAction(token, providedAnswer, target) {
		const record = this._pendingProblems[token];
		if (!record) return { ok: false, reason: 'no such problem or expired' };
		// remove pending to prevent reuse
		delete this._pendingProblems[token];

		const correct = Number(providedAnswer) === Number(record.answer);
		if (!correct) return { ok: false, reason: 'wrong answer' };

		const type = record.actionType;
		if (type === 'heal') {
			return this.heal();
		}

		// attack
		return this.attackTarget(target, type);
	}

	// Attack types: 'super' (x2), 'effective' (x1), 'notvery' (x0.75)
	attackTarget(target, type = 'effective') {
		if (!this.isAlive()) return { ok: false, reason: 'attacker down' };
		if (!target || !target.isAlive()) return { ok: false, reason: 'target down' };

		let multiplier = 1;
		if (type === 'super') multiplier = 2;
		else if (type === 'notvery') multiplier = 0.75;

		const raw = this.baseAttack * multiplier;
		const dealt = target.receiveDamage(raw);
		return { ok: true, type, damage: dealt, targetAlive: target.isAlive() };
	}

	// Heal for fixed amount (50) if heals remain
	heal() {
		if (!this.isAlive()) return { ok: false, reason: 'cannot heal, down' };
		if (this.healsRemaining <= 0) return { ok: false, reason: 'no heals left' };
		const amount = 50;
		const before = this.health;
		this.health = Math.min(this.maxHealth, this.health + amount);
		this.healsRemaining -= 1;
		return { ok: true, healed: this.health - before, healsLeft: this.healsRemaining };
	}

	// Simple CPU decision: prefer healing if low and heals left, otherwise random attack
	chooseActionAgainst(target) {
		if (!this.isCPU) return { action: 'none' };
		if (this.healsRemaining > 0 && this.health <= Math.floor(this.maxHealth * 0.35)) {
			return { action: 'heal' };
		}
		// choose attack type randomly biased: effective most likely
		const r = Math.random();
		if (r < 0.15) return { action: 'attack', type: 'notvery' };
		if (r < 0.85) return { action: 'attack', type: 'effective' };
		return { action: 'attack', type: 'super' };
	}

	// For CPU: generate problem and attempt to solve (with optional failure chance)
	cpuPerform(actionDescriptor, target, accuracy = 0.9) {
		// actionDescriptor: { action: 'heal' } or { action: 'attack', type }
		if (!this.isCPU) return { ok: false, reason: 'not CPU' };
		if (actionDescriptor.action === 'heal') {
			const prob = this.generateProblemFor('heal');
			const willSolve = Math.random() < accuracy;
			const answer = willSolve ? this._pendingProblems[prob.token].answer : this._pendingProblems[prob.token].answer + _randInt(1, 10);
			return this.attemptAction(prob.token, answer, null);
		}
		if (actionDescriptor.action === 'attack') {
			const t = actionDescriptor.type || 'effective';
			const prob = this.generateProblemFor(t);
			const willSolve = Math.random() < accuracy;
			const answer = willSolve ? this._pendingProblems[prob.token].answer : this._pendingProblems[prob.token].answer + _randInt(1, 10);
			return this.attemptAction(prob.token, answer, target);
		}
		return { ok: false, reason: 'unknown descriptor' };
	}
}

// Export for browser and node
if (typeof window !== 'undefined') window.Player = Player;
if (typeof module !== 'undefined' && module.exports) module.exports = Player;

// Demo usage when run in node directly
if (typeof require !== 'undefined' && typeof module !== 'undefined' && module.parent == null) {
	const p1 = new Player('Alice');
	const p2 = new Player('CPU', { isCPU: true });
	console.log('Demo start: Alice vs CPU');

	// Player wants to do a super attack
	const prob = p1.generateProblemFor('super');
	console.log('Solve to perform super attack:', prob.question);
	// simulate correct answer from player
	const ans = p1._pendingProblems[prob.token].answer;
	console.log('Attempt:', p1.attemptAction(prob.token, ans, p2));

	// CPU chooses an action and performs it (auto-solve with 90% accuracy)
	const choice = p2.chooseActionAgainst(p1);
	console.log('CPU choice:', choice);
	let cpuResult;
	if (choice.action === 'heal') cpuResult = p2.cpuPerform(choice);
	else cpuResult = p2.cpuPerform(choice, p1);
	console.log('CPU performed:', cpuResult);
	console.log('Final states:', p1, p2);
}

