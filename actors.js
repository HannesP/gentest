const { v4: uuid_v4 } = require("uuid");

const Primitives = {
  RECEIVE: "RECEIVE",
  SPAWN: "SPAWN",
  SEND: "SEND",
  MONITOR: "MONITOR"
};

const Reasons = {
  NORMAL: "NORMAL",
  ERROR: "ERROR"
};

class ActorSystem {
  constructor(rootActor) {
    this.registry = {};
    this.mailboxes = {};
    this.current = {};
    this.monitors = {};
    this.started = {};

    this.names = {};
    this.namesReverse = {}

    this.start = () => {
      this.spawn(rootActor);
      this.work();
    };
  }

  spawn(actorFun, param, options = {}) {
    const pid = uuid_v4();
    this.mailboxes[pid] = [];
    this.registry[pid] = actorFun.bind(pid)(param);

    const { name } = options;
    if (name) {
      this.names[name] = pid;
      this.namesReverse[pid] = name;

      console.log(`${name} -> ${pid}`);
    }

    return pid;
  }

  postMessage(ref, message) {
    const pid = this.resolveRef(ref);
    const mailbox = this.mailboxes[pid];
    
    if (mailbox == null) {
      const actor = this.registry[pid];
      actor.throw(new Error("trying to mail non-existing actor"));
    } else {
      mailbox.push(message);
    }
  }

  resolveRef(ref) {
    const resolved = this.names[ref];
    return resolved || ref;
  }

  work() {
    const pids = Object.keys(this.registry);
    for (const pid of pids) {
      this.workProcess(pid);
    }

    this.deliverMail();
    setTimeout(() => this.work(), 10);
  }

  cleanUp(pid, reason) {
    delete this.registry[pid];
    delete this.mailboxes[pid];

    if (this.names[pid]) {
      const name = this.namesReverse[pid];
      delete this.namesReverse[pid];
      delete this.names[name];
    }

    const monitor = this.monitors[pid];
    if (monitor != null) {
      this.postMessage(monitor, { type: "EXIT", reason });
    }
  }

  nextMail(pid) {
    const mailbox = this.mailboxes[pid];
    if (mailbox == null || mailbox.length === 0) {
      return null;
    }

    return mailbox.splice(0, 1)[0];
  }

  deliverMail() {
    const pids = Object.keys(this.current);
    for (const pid of pids) {
      if (this.current[pid].type !== Primitives.RECEIVE) {
        continue;
      }

      const mail = this.nextMail(pid);
      if (mail != null) {
        this.feed(pid, mail);
      }
    }
  }

  feed(pid, value) {
    const actor = this.registry[pid];

    try {
      var next = actor.next(value);
      if (next.done) {
        this.cleanUp(pid, Reasons.NORMAL);
      } else {
        this.current[pid] = next.value;
      }
    } catch (err) {
      this.cleanUp(pid, Reasons.ERROR);
    }
  }

  monitor(pid, target) {
    if (pid === target) {
      this.throw(pid, "an actor cannot monitor itself");
    }

    if (!this.isAlive(pid)) {
      this.throw(pid, "an actor cannot monitor a non-existing actor");
    }

    this.monitors[target] = pid;
  }

  isAlive(ref) {
    return this.registry.hasOwnProperty(ref);
  }

  throw(ref, msg) {
    const actor = this.registry[ref];
    actor.throw(new Error(msg));
  }

  init(ref) {
    this.started[ref] = true;
    this.feed(ref);
  }

  workProcess(pid) {
    // Rethink this?

    if (!this.started[pid]) {
      this.init(pid);
    }

    // Might have died during initialisation
    if (!this.isAlive(pid)) {
      return;
    }

    const current = this.current[pid];
    const { type, ...params } = current;

    if (type === Primitives.SPAWN) {
      const spawnedPid = this.spawn(params.actor, params.param, params.options);
      this.feed(pid, spawnedPid);
    } else if (type === Primitives.SEND) {
      this.postMessage(params.ref, params.message);
      this.feed(pid);
    } else if (type === Primitives.MONITOR) {
      this.monitor(pid, params.pid);
      this.feed(pid);
    } else if (type !== Primitives.RECEIVE) {
      throw new Error(`Unhandled command type '${type}'`);
    }
  }
}

function receive() {
  return { type: Primitives.RECEIVE };
}

function send(ref, message) {
  return { type: Primitives.SEND, ref, message };
}

function spawn(actor, param, options) {
  return { type: Primitives.SPAWN, actor, param, options };
}

function monitor(pid) {
  return { type: Primitives.MONITOR, pid };
}

exports.ActorSystem = ActorSystem;
exports.receive = receive;
exports.send = send;
exports.spawn = spawn;
exports.monitor = monitor;
exports.Reasons = Reasons;
