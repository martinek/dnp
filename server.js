const Net = require("net")
const port = 8080

const server = new Net.Server()

server.listen(port, function () {
  console.log(`Server listening on:${port}.`)
})

let counter = 0

server.on("connection", function (socket) {
  const player = new Player(socket)
  counter += 1

  if (counter < 3) {
    if (counter == 1) {
      player.name = "Alice"
      player.pickClass("Konstrukter")
    }

    if (counter == 2) {
      player.name = "Bob"
      player.pickClass("Vypoctovkar")
    }

    player.location = locations[rand(0, locations.length)]
    player.look()
    player.location.notifyEntering(player)
  }

  players.push(player)
  console.log("A new connection has been established.")

  if (player.name === undefined) {
    player.tell("Vitaj, napis si meno:")
  }

  socket.on("data", function (chunk) {
    let input = chunk.toString().trim()

    if (player.name === undefined) {
      player.name = input
      player.tell(`Ahoj ${player.name}`)
      Profession.explain(player)
      console.log(`Player ${player.name} connected`)
      return
    }

    if (player.class === undefined) {
      if (player.pickClass(input)) {
        player.location = locations[rand(0, locations.length)]
        player.look()
        player.location.notifyEntering(player)
      } else {
        Profession.explain(player)
        return
      }
    }

    if (input === ".r") {
      input = player.lastInput
    }

    const [command, ...args] = input.split(" ")
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

      case ".classes":
        Profession.explain(player)
        break

      case ".pick":
        player.pick(args.join(" "))
        break

      case ".drop":
        player.drop(args.join(" "))
        break

      case ".inventory":
        player.showInventory()
        break

      case ".use":
        // .use pocitac, ev3 kocka, foo, booo
        // tool = "pocitac", material = "ev3 kocka"
        const [tool, material] = args
          .join(" ")
          .split(",")
          .map((s) => s.trim())
        player.use(tool, material)
        break

      case ".combine":
        // .combine lego kocka ,lego kocka, lego kocka, lego kocka
        const ingredients = args
          .join(" ")
          .split(",")
          .map((s) => s.trim())
        player.combine(ingredients)
        break

      case ".debug_locations":
        console.log(
          locations
            .map((r) => `${r.name}: ${r.items.map((i) => i.name).join(", ")}`)
            .join("\n")
        )
        break

      case ".tp":
        const newLocation = locations.find((l) => l.name === args.join(" "))
        if (newLocation) {
          player.location = newLocation
        }
        break

      case ".hit":
        player.health -= Number(args[0])
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

const items = [
  "lego kocka",
  "lego kocka",
  "lego kocka",
  "lego kocka",
  "3d tlaciaren",
  "filament",
  "pocitac",
  "EV3 kocka",
  "kable",
]

const recepies = [
  {
    ingredients: ["lego kocka", "lego kocka", "lego kocka", "lego kocka"],
    result: ["lego ram"],
  },
  {
    ingredients: ["lego ram", "kolieska", "riadiaci modul", "kable"],
    result: ["robot"],
  },
]

const players = []

class Player {
  constructor(socket) {
    this._socket = socket
    this.name = undefined
    this.location = undefined
    this.health = rand(10, 20)
    this.base_health = this.health
    this.attack = rand(2, 5)
    this.buff = 1
    this.defense = rand(0, 2)
    this.class = undefined
    this.lastInput = ""
    this.inventory = []
  }

  pickClass(enteredProfession) {
    const profession = Profession.professions.find(
      (l) => l.name === enteredProfession
    )
    if (profession === undefined) {
      this.tell(`Nepoznam profesiu ${enteredProfession}! Skus to znova!`)
      return false
    } else {
      this.class = profession
      this.health += profession.hp_mod
      this.base_health = this.health
      this.defense += profession.def_mod
      this.attack += profession.atk_mod
      this.perk = profession.perk
      this.tell(`Vybral si si profesiu ${enteredProfession}!`)
      return true
    }
  }

  tell(message) {
    this._socket.write((message + "\n").replaceAll("\n", "\r\n"))
  }

  look() {
    this.tell(
      `Lokacia "${this.location.name}"
Vies sa pohnut do: ${this.location.connections.map((l) => l.name).join(", ")}
Vidim hracov: ${this.location
        .players()
        .map((p) => p.name)
        .join(", ")}
Vidim itemy: ${this.location.items.map((item) => item.name).join(", ")}
`
    )
  }

  go(newLocationName) {
    const newLocation = locations.find((l) => l.name === newLocationName)
    if (newLocation === undefined) {
      this.tell(`Nepoznam ${newLocationName}`)
    } else if (
      this.location.connections.find((l) => l.name === newLocation.name)
    ) {
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
  attack: ${this.attack}
  defense: ${this.defense}
  class: ${this.class?.name}
  perk: ${this.class?.perk}`
    )
  }

  challenge(otherPlayerName) {
    const otherPlayer = this.location
      .players()
      .find((p) => p.name === otherPlayerName)
    if (otherPlayer === undefined) {
      this.tell("Hraca nevidim")
    } else if (otherPlayer === this) {
      this.tell("Nemozes bojovat sam zo sebou!")
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

    let amount = Number(amountStr)
    if (isNaN(amount)) {
      this.tell("Kolko?")
      return
    } else if (amount > 8) {
      this.tell("Nie az tak silno")
      return
    }

    // this should be based on luck
    const perkProc = rand(1, 21) > 14 ? this.class.perk : null

    const targetDef = perkProc == "no_def" ? 0 : this.inCombatWith.defense
    const target = 10 + amount + targetDef
    const roll = rand(1, 21)
    const totalRoll = roll + this.attack * this.buff
    const isHit = totalRoll >= target

    if (!isHit) {
      this.combat.tellAll(
        `Hrac ${this.name} netrafil (${roll} + ${this.attack} * ${this.buff}/ ${target} (10 + ${amount} + ${targetDef}))`
      )
      this.buff = 1
      this.combat.nextTurn()
      this.combat.reportTurn()
      return
    }

    if (perkProc == "crit") {
      this.combat.tellAll("Critical hit! (1.5x)")
      amount *= 1.5
    } else if (perkProc == "no_def") {
      this.combat.tellAll("No defense!")
    }

    if (this.inCombatWith.perk === "block") {
      // try rolling for block proc
      if (rand(1, 21) > 14) {
        this.combat.tellAll(`Blocked!`)
        amount = 0
      }
    }

    this.buff = 1
    this.inCombatWith.takeHit(amount)
    this.combat.tellAll(`Hrac ${this.name} trafil za ${amount}`)

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

  pick(itemName) {
    if (this.location.hasItem(itemName)) {
      const i = this.location.items.findIndex((item) => {
        return item.name === itemName
      })
      if (this.location.items[i].isPickable()) {
        const removed = this.location.items.splice(i, 1)[0]
        this.inventory.push(removed)
        this.tell(`Zdvihol si ${removed.name}`)
      } else {
        this.tell("Not today Rambo!")
      }
    } else {
      this.tell("Co chces zdvihnut?")
    }
  }

  drop(itemName) {
    if (this.hasItem(itemName)) {
      const i = this.inventory.findIndex((item) => {
        return item.name === itemName
      })
      const removed = this.inventory.splice(i, 1)[0]
      this.location.items.push(removed)
      this.tell(`Zahodil si ${removed.name}`)
    } else {
      this.tell("Co chces zahodit?")
    }
  }

  use(tool, material) {
    if (this.location.hasItem(tool)) {
      if (this.hasItem(material) || material === undefined) {
        const toolIndex = this.location.items.findIndex(
          (item) => item.name === tool
        )
        const result = this.location.items[toolIndex].use(material, this)
        if (result === false) {
          this.tell("To sa neda takto pouzit")
          return
        }

        this.inventory.push(result)
        if (material !== undefined) {
          const i = this.inventory.findIndex((item) => item.name === material)
          this.inventory.splice(i, 1)
        }

        if (result !== true) {
          this.tell(`Vyrobil si: ${result.name}`)
          this.showInventory()
        }
      } else {
        this.tell("To nemas")
      }
    } else {
      this.tell("V tejto lokacii to neni")
    }
  }

  combine(ingredients) {
    const needle = arrayHash(ingredients)
    const recepie = recepies.find(
      (recepie) => arrayHash(recepie.ingredients) === needle
    )
    if (recepie === undefined) {
      this.tell("Nope!")
      return
    }
    const tmpInventory = this.inventory.slice(0)
    for (const ingredient of ingredients) {
      const idx = tmpInventory.findIndex((item) => item.name === ingredient)
      if (idx === -1) {
        this.tell("Nemas vsetko co potrebujes v inventari")
        return
      }
      tmpInventory.splice(idx, 1)
    }
    this.inventory = tmpInventory
    recepie.result.forEach((rName) => {
      this.inventory.push(new Item(rName))
      this.tell(`Vyrobil si: ${rName}`)

      if (rName === "robot") {
        const time = startTime - Date.now()
        players.forEach((p) => {
          p.tell(`MAME ROBOTA, trvalo to: ${time}`)
        })
      }
    })
    this.showInventory()
  }

  showInventory() {
    this.tell(
      `V inventari: ${this.inventory.map((item) => item.name).join(", ")}`
    )
  }

  hasItem(itemName) {
    return (
      this.inventory.filter((item) => {
        return item.name === itemName
      }).length > 0
    )
  }
}

class Location {
  constructor(name) {
    this.name = name
    this.connections = []
    this.items = []
  }

  connect(otherRoom) {
    if (this.connections.includes(otherRoom)) {
      return
    }
    this.connections.push(otherRoom)
    otherRoom.connections.push(this)
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

  hasItem(itemName) {
    return (
      this.items.filter((item) => {
        return item.name === itemName
      }).length > 0
    )
  }

  canSpawn(item) {
    switch (this.name) {
      case "Zdravotnicka":
        return false

      default:
        return true
    }
  }

  spawnItem(item) {
    this.items.push(item)
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

class Profession {
  static professions = [
    // profesia, HP modifier, DEF modifier, ATK modifier, perk
    new Profession("Tlaciar", 0, 2, -2, "block"),
    new Profession("Konstrukter", 1, -1, 0, "no_def"),
    new Profession("Vypoctovkar", -1, -1, 2, "crit"),
  ]

  constructor(name, hp_mod, def_mod, atk_mod, perk) {
    this.name = name
    this.hp_mod = hp_mod
    this.def_mod = def_mod
    this.atk_mod = atk_mod
    this.perk = perk
  }

  players() {
    return players.filter((p) => p.profession == this)
  }

  static explain(player) {
    player.tell(`=============
Zoznam povolani:
Tlaciar -  0, 2, -2, "block"
Konstrukter -  1, -1, 0, "no_def"
Vypoctovkar -  -1, -1, 2, "crit
=============`)
  }
}

class Item {
  constructor(name) {
    this.name = name
  }

  isPickable() {
    if (this.name === "pocitac" || this.name === "3d tlaciaren") {
      return false
    } else {
      return true
    }
  }

  use(material, player) {
    if (this.name === "pocitac") {
      if (material === "EV3 kocka") {
        return new Item("riadiaci modul")
      }
    }
    if (this.name === "3d tlaciaren") {
      if (material === "filament") {
        return new Item("kolieska")
      }
    }
    if (this.name === "lekarnicka 3001") {
      player.health = player.base_health
      player.tell(`Pouzil si lekarnicku. Tvoje HP je: ${player.health}`)
      return true
    }
    return false
  }
}

const location_vonku = new Location("Vonku")
const location_chodba = new Location("Chodba")
const location_av = new Location("AV")
const location_bar = new Location("Bar")
const location_nad_schodami = new Location("Nad schodami")
const location_chodba_na_poschodi = new Location("Chodba na poschodi")
const location_vypoctovka = new Location("Vypoctovka")
const location_konstrukcia = new Location("Konstrukcia")
const location_zdravotnicka = new Location("Zdravotnicka")
location_zdravotnicka.spawnItem(new Item("lekarnicka 3001"))
const location_3d_tlac = new Location("3D tlac")

location_vonku.connect(location_chodba)

location_chodba.connect(location_nad_schodami)
location_chodba.connect(location_av)
location_chodba.connect(location_bar)

location_nad_schodami.connect(location_vypoctovka)
location_nad_schodami.connect(location_konstrukcia)
location_nad_schodami.connect(location_chodba_na_poschodi)

location_chodba_na_poschodi.connect(location_zdravotnicka)
location_chodba_na_poschodi.connect(location_av)
location_chodba_na_poschodi.connect(location_3d_tlac)

const locations = [
  location_vonku,
  location_chodba,
  location_av,
  location_bar,
  location_nad_schodami,
  location_chodba_na_poschodi,
  location_vypoctovka,
  location_konstrukcia,
  location_zdravotnicka,
  location_3d_tlac,
]

items.forEach((itemName) => {
  const item = new Item(itemName)
  const location = sample(locations.filter((l) => l.canSpawn(item)))
  if (!location) {
    console.error(`Could not spawn item ${itemName}. No locations available.`)
    process.exit(1)
  }
  location.spawnItem(item)
})

function rand(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

function arrayHash(strings) {
  return strings
    .slice(0)
    .sort((a, b) => a.localeCompare(b))
    .join("@")
}

function sample(array) {
  return array[rand(0, array.length - 1)]
}
