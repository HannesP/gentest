const {
  monitor,
  send,
  receive,
  spawn,
  Reasons,
  ActorSystem
} = require("./actors");

function* stack(self, initial) {
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

function* countingActor(_self, initial) {
  let count = initial;

  while (true) {
    const { type, ...params } = yield receive();
    if (type === "inc") {
      count += params.amount;
    } else if (type === "dec") {
      count -= params.amount;
    } else if (type === "ask") {
      throw new Error("cannot be asked!");
      yield send(params.caller, count);
    }
  }
}

function* supervisor(self, [actor, param]) {
  while (true) {
    const ref = yield spawn(actor, param);
    yield monitor(ref);

    while (true) {
      const { reason } = yield receive();
      if (reason === Reasons.ERROR) {
        break;
      }
    }
  }
}

function* root(self) {
  yield spawn(supervisor, [countingActor, 5]);
  while (true) {
    yield receive();
  }

  // yield send(ref, { type: "inc", amount: 10 });
  // yield send(ref, { type: "ask", caller: self });
  // const answer = yield receive();
  // console.log(answer); // outputs 7
}

const system = new ActorSystem(root);
system.start();

// function* root() {
//   const ref = yield spawn(failingActor);
//   yield send(ref, "succeed");
//   yield send(ref, "succeed");
//   yield send(ref, "fail");
// }
