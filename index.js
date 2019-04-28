const {
  monitor,
  send,
  receive,
  spawn,
  Reasons,
  ActorSystem
} = require("./actors");

function* stack(initial) {
  let stack = initial ? [...initial] : [];

  while (true) {
    const message = yield receive();
    const { type, ...params } = message;

    if (type === "push") {
      stack = [...stack, params.value];
    } else if (type === "pop") {
      stack = stack.slice(0, -1);
    } else if (type === "read") {
      yield send(params.caller, { type: "value", value: stack });
    }
  }
}

function* countingActor(initial) {
  let count = initial;

  while (true) {
    const { type, ...params } = yield receive();
    if (type === "inc") {
      count += params.amount;
    } else if (type === "dec") {
      count -= params.amount;
    } else if (type === "ask") {
      // throw new Error("cannot be asked!");
      yield send(params.caller, count);
    }
  }
}

function* supervisor([actor, param, options]) {
  while (true) {
    const ref = yield spawn(actor, param, options);
    yield monitor(ref);

    while (true) {
      const { reason } = yield receive();
      if (reason === Reasons.ERROR) {
        break;
      }
    }
  }
}

function* root() {
  const spec = [countingActor, 5, { name: "counter" }];
  yield spawn(supervisor, spec);

  while (true) {
    yield receive();
  }
}

const system = new ActorSystem(root);
system.start();
