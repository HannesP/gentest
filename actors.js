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
    const ref = uuid_v4();
    this.mailboxes[ref] = [];
    this.registry[ref] = actorFun.bind(ref)(param);

    const { name } = options;
    if (name) {
      this.names[name] = ref;
      this.namesReverse[ref] = name;

      console.log(`${name} -> ${ref}`);
    }

    return ref;
  }

  postMessage(ref, message) {
    const mailbox = this.mailboxes[ref];
    if (mailbox == null) {
      const actor = this.registry[ref];
      actor.throw(new Error("trying to mail non-existing actor"));
    } else {
      mailbox.push(message);
    }
  }

  work() {
    const refs = Object.keys(this.registry);
    for (const ref of refs) {
      this.workRef(ref);
    }

    this.deliverMail();
    setTimeout(() => this.work(), 10);
  }

  cleanUp(ref, reason) {
    delete this.registry[ref];
    delete this.mailboxes[ref];

    if (this.names[ref]) {
      const name = this.namesReverse[ref];
      delete this.namesReverse[ref];
      delete this.names[name];
    }

    const monitor = this.monitors[ref];
    if (monitor != null) {
      this.postMessage(monitor, { type: "EXIT", reason });
    }
  }

  nextMail(ref) {
    const mailbox = this.mailboxes[ref];
    if (mailbox == null || mailbox.length === 0) {
      return null;
    }

    return mailbox.splice(0, 1)[0];
  }

  deliverMail() {
    const refs = Object.keys(this.current);
    for (const ref of refs) {
      if (this.current[ref].type !== Primitives.RECEIVE) {
        continue;
      }

      const mail = this.nextMail(ref);
      if (mail != null) {
        this.feed(ref, mail);
      }
    }
  }

  feed(ref, value) {
    const actor = this.registry[ref];

    try {
      var next = actor.next(value);
      if (next.done) {
        this.cleanUp(ref, Reasons.NORMAL);
      } else {
        this.current[ref] = next.value;
      }
    } catch (err) {
      this.cleanUp(ref, Reasons.ERROR);
    }
  }

  monitor(ref, target) {
    if (ref === target) {
      this.throw(ref, "an actor cannot monitor itself");
    }

    if (!this.isAlive(ref)) {
      this.throw(ref, "an actor cannot monitor a non-existing actor");
    }

    this.monitors[target] = ref;
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

  workRef(ref) {
    if (!this.started[ref]) {
      this.init(ref);
    }

    // Might have died during initialisation
    if (!this.isAlive(ref)) {
      return;
    }

    const current = this.current[ref];
    const { type, ...params } = current;

    if (type === Primitives.SPAWN) {
      const spawnedRef = this.spawn(params.actor, params.param, params.options);
      this.feed(ref, spawnedRef);
    } else if (type === Primitives.SEND) {
      this.postMessage(params.ref, params.message);
      this.feed(ref);
    } else if (type === Primitives.MONITOR) {
      this.monitor(ref, params.ref);
      this.feed(ref);
    } else if (type !== Primitives.RECEIVE) {
      throw new Error(`Unhandled command type '${type}'`);
    }
  }
}

function receive() {
  return { type: Primitives.RECEIVE };
}

function send(receiver, message) {
  return { type: Primitives.SEND, receiver, message };
}

function spawn(actor, param, options) {
  return { type: Primitives.SPAWN, actor, param, options };
}

function monitor(ref) {
  return { type: Primitives.MONITOR, ref };
}

exports.ActorSystem = ActorSystem;
exports.receive = receive;
exports.send = send;
exports.spawn = spawn;
exports.monitor = monitor;
exports.Reasons = Reasons;
