const Net = require("net")
const port = 8080

const server = new Net.Server()

server.listen(port, function () {
  console.log(`Server listening on:${port}.`)
})

server.on("connection", function (socket) {
  const player = new Player(socket)
  players.push(player)
  console.log("A new connection has been established.")
  player.tell("Vitaj, napis si meno:")

  socket.on("data", function (chunk) {
    let input = chunk.toString().trim()

    if (player.name === undefined) {
      player.name = input
      player.location = locations[rand(0, locations.length)]
      player.tell(`Ahoj ${player.name}`)
      player.look()
      console.log(`Player ${player.name} connected`)
      player.location.notifyEntering(player)
      return
    }

    if (input === ".r") {
      input = player.lastInput
    }

    let [command, ...args] = input.split(" ")
    console.log(`Player ${player.name}: ${command}`)
    if (player.isDead) {
      player.tell("Dead man tells no tales")
      return
    }
    switch (command) {
      case ".help":
        player.tell(`=============
Dostupne prikazy:
  .help - tento help
  .look - napise co vidi
  .go - presunie ta do lokacie
  .say - povie do lokacie
  .yell - povie vsetkym hracom
  .stats - ukaze tvoje statistiky
  .challenge - vyzvi na suboj hraca
    .attack <num> - zautoci s hodnotou <num>
    .buff - buffnes svoje sance na dalsi utok
  .r - zopakuje posledny prikaz
`)
        break

      case ".look":
        player.look()
        break

      case ".go":
        player.go(args.join(" "))
        break

      case ".say":
        player.say(args.join(" "))
        break

      case ".yell":
        player.yell(args.join(" "))
        break

      case ".stats":
        player.stats()
        break

      case ".challenge":
        player.challenge(args.join(" "))
        break

      case ".accept":
        player.accept()
        break

      case ".decline":
        player.decline()
        break

      case ".attack":
        player.executeAttack(args[0])
        break

      case ".buff":
        player.executeBuff()
        break

      default:
        break
    }

    player.lastInput = input
  })

  socket.on("end", function () {
    console.log("Closing connection with the client")
  })
})

const players = []

class Player {
  constructor(socket) {
    this._socket = socket
    this.name = undefined
    this.location = undefined
    this.health = rand(10, 20)
    this.attack = rand(2, 5)
    this.buff = 1
    this.ac = rand(1, 3)
    this.lastInput = ""
  }

  tell(message) {
    this._socket.write((message + "\n").replaceAll("\n", "\r\n"))
  }

  look() {
    this.tell(
      `Lokacia "${this.location.name}"
${this.location.description}
Vies sa pohnut do: ${this.location.options.join(", ")}
Vidim hracov: ${this.location
        .players()
        .map((p) => p.name)
        .join(", ")}
`
    )
  }

  go(newLocationName) {
    const newLocation = locations.find((l) => l.name === newLocationName)
    if (newLocation === undefined) {
      this.tell(`Nepoznam ${newLocationName}`)
    } else if (this.location.options.includes(newLocation.name)) {
      this.location.notifyLeaving(this)
      this.location = newLocation
      this.look()
      this.location.notifyEntering(this)
    } else {
      this.tell(`Neda sa!`)
    }
  }

  say(message) {
    this.location.players().forEach((p) => {
      p.tell(`${this.name}: ${message}`)
    })
  }

  yell(message) {
    players.forEach((p) => {
      p.tell(`${this.name}: ${message.toUpperCase()}`)
    })
  }

  stats() {
    this.tell(
      `========================
Statistiky:
  health: ${this.health}
  ac:     ${this.ac}
  attack: ${this.attack}
  buff:   ${this.buff}
========================`
    )
  }

  challenge(otherPlayerName) {
    const otherPlayer = this.location
      .players()
      .find((p) => p.name === otherPlayerName)
    if (otherPlayer === undefined) {
      this.tell("Hraca nevidim")
    } else {
      otherPlayer.challengedBy = this
      otherPlayer.tell(`${this.name} ta vyziva na boj (.accept / .decline)`)
      this.challenging = otherPlayer
      this.tell(`Vyzval si na suboj ${otherPlayer.name}`)
    }
  }

  accept() {
    if (this.challengedBy) {
      this.inCombatWith = this.challengedBy
      this.challengedBy = undefined
      this.inCombatWith.challenging = undefined
      this.inCombatWith.inCombatWith = this
      this.tell(`Si v suboji s ${this.inCombatWith.name}`)
      this.inCombatWith.tell(`Si v suboji s ${this.name}`)

      const combat = new Combat(this.inCombatWith, this)
      this.combat = combat
      this.inCombatWith.combat = combat
      combat.reportTurn()
    }
  }

  decline() {
    if (this.challengedBy) {
      this.challengedBy.tell(`${this.name} neprijal vyzvu`)
      this.challengedBy.challenging = undefined
      this.challengedBy = undefined
      this.tell("Neprijal si vyzvu")
    }
  }

  executeAttack(amountStr) {
    if (!this.combat || this.combat.turn !== this) {
      this.tell("Nie si na tahu / v combate")
      return
    }

    const amount = Number(amountStr)
    if (isNaN(amount)) {
      this.tell("Kolko?")
      return
    } else if (amount > 8) {
      this.tell("Nie az tak silno")
      return
    }

    const target = 10 + amount + this.inCombatWith.ac
    const roll = rand(1, 21)
    const totalRoll = roll + this.attack * this.buff
    const isHit = totalRoll >= target

    if (!isHit) {
      this.combat.tellAll(
        `Hrac ${this.name} netrafil (${roll} + ${this.attack} * ${this.buff}/ ${target} (${this.inCombatWith.ac}))`
      )
      this.buff = 1
      this.combat.nextTurn()
      this.combat.reportTurn()
      return
    }

    this.combat.tellAll(
      `Hrac ${this.name} trafil za ${amount} (${roll} + ${this.attack} * ${this.buff}/ ${target} (${this.inCombatWith.ac}))`
    )
    this.buff = 1
    this.inCombatWith.takeHit(amount)
    if (!this.inCombatWith.isDead) {
      this.combat.nextTurn()
      this.combat.reportTurn()
      return
    }

    players.forEach((p) =>
      p.tell(`============================================
${this.name} zabil ${this.inCombatWith.name}
============================================`)
    )
    this.combat.end()
  }

  executeBuff() {
    if (!this.combat || this.combat.turn !== this) {
      this.tell("Nie si na tahu / v combate")
      return
    }
    this.buff += 0.5 //(*1.5)
    this.combat.tellAll(`Hrac ${this.name} sa buffuje!(${this.buff})`)

    this.combat.nextTurn()
    this.combat.reportTurn()
  }

  takeHit(amount) {
    this.health -= amount

    if (this.health <= 0) {
      this.isDead = true
    }
  }
}

class Location {
  constructor(name, description, options) {
    this.name = name
    this.description = description
    this.options = options
  }

  players() {
    return players.filter((p) => p.location == this)
  }

  notifyEntering(enteringPlayer) {
    this.players().forEach((p) => {
      if (p === enteringPlayer) return
      p.tell(`${enteringPlayer.name} vosiel do miestnosti`)
    })
  }

  notifyLeaving(leavingPlayer) {
    this.players().forEach((p) => {
      if (p === leavingPlayer) return
      p.tell(`${leavingPlayer.name} odisiel z miestnosti`)
    })
  }
}

class Combat {
  constructor(player1, player2) {
    this.player1 = player1
    this.player2 = player2
    this.turn = this.player1
  }

  reportTurn() {
    this.tellAll(`
========= Na tahu je: ${this.turn.name} =========
`)
  }

  tellAll(message) {
    ;[this.player1, this.player2].forEach((p) => {
      p.tell(message)
    })
  }

  nextTurn() {
    this.turn = this.turn === this.player1 ? this.player2 : this.player1
  }

  end() {
    ;[this.player1, this.player2].forEach((p) => {
      p.inCombatWith = undefined
      p.combat = undefined
    })
  }
}

const locations = [
  new Location(
    "Parkovisko",
    "Vidis prazdne parkovisko vylozene macacimi hlavami",
    ["Chodba"]
  ),
  new Location("Chodba", "Vidis drevene dvere vpredu aj vzadu", [
    "Parkovisko",
    "Krb",
    "Bar",
  ]),
  new Location("Bar", "Vidis dreveny pult", ["Chodba"]),
  new Location("Krb", "Vidis gulaty krb", ["Zachody", "Bar"]),
  new Location("Zachody", "Vidis zachody", ["Krb"]),
]

const rand = (min, max) => {
  return Math.floor(Math.random() * (max - min)) + min
}
