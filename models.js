const {
  arrayHash,
  rand,
  sample,
  getTranslationFromTranslations,
} = require("./utils")

const DIVIDER = "##########"
const LONG_DIVIDER = DIVIDER + DIVIDER + DIVIDER + DIVIDER

class Player {
  constructor(socket, game) {
    this._socket = socket
    this.name = undefined
    this.location = undefined
    this.health = rand(10, 20)
    this.base_health = this.health
    this.attack = rand(2, 4)
    this.buff = 1
    this.defense = rand(1, 3)
    this.class = undefined
    this.lastInput = ""
    this.inventory = []
    this.game = game
  }

  is(name = "") {
    return this.name.toLowerCase() === name.toLowerCase()
  }
  isAdmin() {
    return this.admin === true
  }
  checkAdmin() {
    if (!this.isAdmin()) {
      this.tell(this.game.getTranslation("server.player.admin.is_not_admin"))
      return false
    }
    return true
  }

  pickClass(enteredProfession) {
    const profession = Profession.getProfession(enteredProfession)
    if (profession === undefined) {
      this.tell(
        this.game.getTranslation("server.player.profession.invalid_message", {
          enteredProfession: enteredProfession,
        })
      )
      return false
    } else {
      this.class = profession
      this.health += profession.hp_mod
      this.base_health = this.health
      this.defense += profession.def_mod
      this.attack += profession.atk_mod
      this.perk = profession.perk
      this.tell(
        this.game.getTranslation("server.player.profession.selected_message", {
          enteredProfession: enteredProfession,
        })
      )
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
    const newLocation = this.location.map.getLocation(newLocationName)
    if (newLocation === undefined) {
      this.tell(
        this.game.getTranslation("server.player.invalid_location_message", {
          location: newLocationName,
        })
      )
    } else if (this.location.getConnection(newLocation.name)) {
      this.location.notifyLeaving(this)
      this.location = newLocation
      this.look()
      this.location.notifyEntering(this)
    } else {
      this.tell(
        this.game.getTranslation("server.player.unable_to_enter_location")
      )
    }
  }

  say(message) {
    this.location.players().forEach((p) => {
      p.tell(`${this.name}: ${message}`)
    })
  }

  yell(message) {
    this.allPlayers().forEach((p) => {
      p.tell(`${this.name}: ${message.toUpperCase()}`)
    })
  }

  stats() {
    this.tell(
      `${LONG_DIVIDER}
Statistiky:
  health: ${this.health}
  attack: ${this.attack}
  defense: ${this.defense}
  class: ${this.class?.name}
  perk: ${this.class?.perk}`
    )
  }

  challenge(otherPlayerName) {
    const otherPlayer = this.location.getPlayer(otherPlayerName)
    if (otherPlayer === undefined) {
      this.tell(this.game.getTranslation("server.player.combat.invalid_target"))
    } else if (otherPlayer === this) {
      this.tell(
        this.game.getTranslation("server.player.combat.suicidal_target")
      )
    } else {
      otherPlayer.challengedBy = this
      otherPlayer.tell(
        this.game.getTranslation(
          "server.player.combat.received_request_message",
          { player: this.name }
        )
      )
      this.challenging = otherPlayer
      this.tell(
        this.game.getTranslation("server.player.combat.sent_request_message", {
          player: otherPlayer.name,
        })
      )
    }
  }

  accept() {
    if (this.challengedBy) {
      this.inCombatWith = this.challengedBy
      this.challengedBy = undefined
      this.inCombatWith.challenging = undefined
      this.inCombatWith.inCombatWith = this
      this.tell(
        this.game.getTranslation("server.player.combat.fight_begin_message", {
          player: this.inCombatWith.name,
        })
      )
      this.inCombatWith.tell(
        this.game.getTranslation("server.player.combat.fight_begin_message", {
          player: this.name,
        })
      )

      const combat = new Combat(this.inCombatWith, this)
      this.combat = combat
      this.inCombatWith.combat = combat
      combat.reportTurn()
    }
  }

  decline() {
    if (this.challengedBy) {
      this.challengedBy.tell(
        this.game.getTranslation("server.player.combat.request_denied", {
          player: this.name,
        })
      )
      this.challengedBy.challenging = undefined
      this.challengedBy = undefined
      this.tell(
        this.game.getTranslation(
          "server.player.combat.request_denied_challenged"
        )
      )
    }
  }

  executeAttack(amountStr) {
    if (!this.combat || this.combat.turn !== this) {
      this.tell(this.game.getTranslation("server.player.combat.not_your_turn"))
      return
    }

    let amount = Number(amountStr)
    if (isNaN(amount)) {
      this.tell(this.game.getTranslation("server.player.combat.NaN_attack"))
      return
    } else if (amount > 8) {
      this.tell(
        this.game.getTranslation("server.player.combat.too_strong_attack")
      )
      return
    }

    // this should be based on luck
    const perkProc = rand(1, 21) > 14 ? this.class.perk : null

    const targetDef = perkProc == "no_def" ? 0 : this.inCombatWith.defense
    const target = 10 + amount + targetDef
    const roll = rand(1, 21)
    const totalRoll = roll + this.attack + this.buff
    const isHit = totalRoll >= target

    if (!isHit) {
      const calculation = `${roll} + ${this.attack} + ${this.buff} / ${target} (10 + ${amount} + ${targetDef})`
      const translation = this.game.getTranslation(
        "server.player.combat.didnt_hit",
        { calculation: calculation }
      )

      this.combat.tellAll(translation)

      this.buff = 1
      this.combat.nextTurn()
      this.combat.reportTurn()
      return
    }

    if (perkProc == "crit") {
      this.combat.tellAll(this.game.getTranslation("server.player.combat.crit"))
      amount *= 1.5
    } else if (perkProc == "no_def") {
      this.combat.tellAll(
        this.game.getTranslation("server.player.combat.no_def")
      )
    }

    if (this.inCombatWith.perk === "block") {
      // try rolling for block proc
      if (rand(1, 21) > 14) {
        this.combat.tellAll(
          this.game.getTranslation("server.player.combat.blocked")
        )
        amount = 0
      }
    }

    this.buff = 1
    this.inCombatWith.takeHit(amount)
    this.combat.tellAll(
      this.game.getTranslation("server.player.combat.player_hit", {
        player: this.name,
        amount: amount,
      })
    )

    if (!this.inCombatWith.isDead) {
      this.combat.nextTurn()
      this.combat.reportTurn()
      return
    }

    this.inCombatWith.dropAllItems()
    this.allPlayers().forEach((p) =>
      p.tell(
        this.game.getTranslation("server.player.combat.end_death", {
          long: LONG_DIVIDER,
          killer: this.name,
          killed: this.inCombatWith.name,
        })
      )
    )
    this.combat.end()
  }

  dropAllItems() {
    if (this.location) {
      this.location.items.push(...this.inventory)
    }
  }

  executeBuff() {
    if (!this.combat || this.combat.turn !== this) {
      this.tell(this.game.getTranslation("server.player.combat.not_your_turn"))
      return
    }
    this.buff += 0.5 //(*1.5)
    this.combat.tellAll(
      this.game.getTranslation("server.player.combat.execute_buff", {
        player: this.name,
        buff: this.buff,
      })
    )

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
      const i = this.location.items.findIndex((item) => item.is(itemName))
      if (this.location.items[i].isPickable()) {
        const removed = this.location.items.splice(i, 1)[0]
        this.inventory.push(removed)
        this.tell(
          this.game.getTranslation("server.player.items.took", {
            item: removed.name,
          })
        )
      } else {
        this.tell(
          this.game.getTranslation("server.player.items.unable_to_take")
        )
      }
    } else {
      this.tell(
        this.game.getTranslation("server.player.items.unable_to_find_item")
      )
    }
  }

  drop(itemName) {
    if (this.hasItem(itemName)) {
      const i = this.inventory.findIndex((item) => item.is(itemName))
      const removed = this.inventory.splice(i, 1)[0]
      this.location.items.push(removed)
      this.tell(
        this.game.getTranslation("server.player.items.drop", {
          drop: removed.name,
        })
      )
    } else {
      this.tell(
        this.game.getTranslation("server.player.items.invalid_item_drop")
      )
    }
  }

  use(tool, material) {
    if (this.location.hasItem(tool)) {
      if (this.hasItem(material) || material === undefined) {
        const toolIndex = this.location.items.findIndex((item) => item.is(tool))
        const result = this.location.items[toolIndex].use(material, this)
        if (result === false) {
          this.tell(this.game.getTranslation("server.player.use.fail"))
          return
        }

        this.inventory.push(result)
        if (material !== undefined) {
          const i = this.inventory.findIndex((item) => item.is(material))
          this.inventory.splice(i, 1)
        }

        if (result !== true) {
          this.tell(
            this.game.getTranslation("server.player.use.success", {
              result: result.name,
            })
          )
          this.showInventory()
        }
      } else {
        this.tell(this.game.getTranslation("server.player.use.missing_item"))
      }
    } else {
      this.tell(this.game.getTranslation("server.player.use.invalid_location"))
    }
  }

  combine(ingredients) {
    const needle = arrayHash(ingredients)
    const recepie = this.location.map.game.recepies.find(
      (recepie) => arrayHash(recepie.ingredients) === needle
    )
    if (recepie === undefined) {
      this.tell(this.game.getTranslation("server.player.combine.fail"))
      return
    }
    const tmpInventory = this.inventory.slice(0)
    for (const ingredient of ingredients) {
      const idx = tmpInventory.findIndex((item) => item.is(ingredient))
      if (idx === -1) {
        this.tell(this.game.getTranslation("server.player.combine.not_enough"))
        return
      }
      tmpInventory.splice(idx, 1)
    }
    this.inventory = tmpInventory
    recepie.result.forEach((rName) => {
      this.inventory.push(new Item(rName))
      this.tell(
        this.game.getTranslation("server.player.combine.success", {
          result: rName,
        })
      )

      if (rName === "robot") {
        const time = startTime - Date.now()
        this.allPlayers().forEach((p) => {
          p.tell(this.game.getTranslation("server.game.goal_satisfied"))
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
    return this.inventory.filter((item) => item.is(itemName)).length > 0
  }

  allPlayers() {
    return this.location.map.game.players
  }
}

class Location {
  constructor(map, name) {
    this.map = map
    this.name = name
    this.connections = []
    this.items = []
  }

  is(name = "") {
    return this.name.toLowerCase() === name.toLowerCase()
  }

  connect(otherRoom) {
    if (this.connections.includes(otherRoom)) {
      return
    }
    this.connections.push(otherRoom)
    otherRoom.connections.push(this)
  }

  notifyEntering(enteringPlayer) {
    this.players().forEach((p) => {
      if (p === enteringPlayer) return
      p.tell(
        this.map.game.getTranslation("server.room.entering_player", {
          enteringPlayer: enteringPlayer.name,
        })
      )
    })
  }

  notifyLeaving(leavingPlayer) {
    this.players().forEach((p) => {
      if (p === leavingPlayer) return
      p.tell(
        this.map.game.getTranslation("server.room.leaving_player", {
          leavingPlayer: leavingPlayer.name,
        })
      )
    })
  }

  hasItem(itemName) {
    return this.items.filter((item) => item.is(itemName)).length > 0
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

  players() {
    return this.map.game.players.filter((p) => p.location === this)
  }

  getConnection(name = "") {
    return this.connections.find((l) => l.is(name))
  }

  getPlayer(name = "") {
    return this.players().find((p) => p.is(name))
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
${DIVIDER} Na tahu je: ${this.turn.name} ${DIVIDER}
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

  is(name = "") {
    return this.name.toLowerCase() === name.toLowerCase()
  }

  players() {
    return players.filter((p) => p.profession == this)
  }

  static getProfession(name = "") {
    return this.professions.find((p) => p.is(name))
  }

  static explain(player) {
    player.tell(`${LONG_DIVIDER}
Zoznam povolani:
Tlaciar -  0, 2, -2, "block"
Konstrukter -  1, -1, 0, "no_def"
Vypoctovkar -  -1, -1, 2, "crit
${LONG_DIVIDER}`)
  }
}

class Item {
  constructor(name) {
    this.name = name
  }

  is(name = "") {
    return this.name.toLowerCase() === name.toLowerCase()
  }

  isPickable() {
    if (this.name === "pocitac" || this.name === "3d tlaciaren") {
      return false
    } else {
      return true
    }
  }

  use(material, player) {
    if (this.is("pocitac")) {
      if (material === "EV3 kocka") {
        return new Item("riadiaci modul")
      }
    }
    if (this.is("3d tlaciaren")) {
      if (material === "filament") {
        return new Item("kolieska")
      }
    }
    if (this.is("lekarnicka 3001")) {
      player.health = player.base_health
      player.tell(
        player.game.getTranslation("server.player.heal_action", {
          health: player.health,
        })
      )
      return true
    }
    return false
  }
}

/*
 * Game now requires server-settings JSON and translations JSON in order to initialize properly
 * See ./utils.js and ./server.js
 */
class Game {
  constructor(translations, settings) {
    this.translations = translations
    this.settings = settings

    this.players = []
    this.recepies = []
    this.initialize()
  }

  initialize() {
    this.map = new Map(this)

    const zdravotnicka = this.map.getLocation("zdravotnicka")
    if (!zdravotnicka) {
      console.error("Map does not contain 'zdravotnicka'.")
      process.exit(1)
    }
    zdravotnicka.spawnItem(new Item("lekarnicka 3001"))

    this.recepies = [
      {
        ingredients: ["lego kocka", "lego kocka", "lego kocka", "lego kocka"],
        result: ["lego ram"],
      },
      {
        ingredients: ["lego ram", "kolieska", "riadiaci modul", "kable"],
        result: ["robot"],
      },
    ]

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

    items.forEach((itemName) => {
      const item = new Item(itemName)
      const location = sample(
        this.map.locations.filter((l) => l.canSpawn(item))
      )
      if (!location) {
        console.error(
          `Could not spawn item ${itemName}. No locations available.`
        )
        process.exit(1)
      }
      location.spawnItem(item)
    })
  }
  reloadFromJson(json) {
    this.map.loadFromJson(json)
    this.players.forEach((player) => {
      player.location = this.map.getRandomLocation()
      player.tell("Game reloaded")
      player.look()
    })
  }

  getTranslation(translation, replacements = {}) {
    return getTranslationFromTranslations(
      this.translations,
      translation,
      replacements
    )
  }

  debugLocations() {
    console.log(
      this.map.locations
        .map((r) => `${r.name}: ${r.items.map((i) => i.name).join(", ")}`)
        .join("\n")
    )
  }

  getPlayersInLocation(location) {
    return this.players.filter((p) => p.location === location)
  }
}

class Map {
  constructor(game) {
    this.game = game
    this.locations = []
    this.buildMap()
  }
  loadFromJson(json) {
    let nameToLocation = {}
    this.locations = json.locations.map((jsonLocation) => {
      let location = new Location(this, jsonLocation.name)
      jsonLocation.items.forEach((item) => location.spawnItem(new Item(item)))
      nameToLocation[jsonLocation.name] = location
      return location
    })
    json.locations.forEach((jsonLocation) => {
      nameToLocation[jsonLocation.name].connections = jsonLocation.connections
        .map((connection) => nameToLocation[connection])
        .filter((connection) => connection !== undefined)
    })
  }
  saveToJson() {
    let json = {}
    json.locations = this.locations.map((location) => ({
      name: location.name,
      items: location.items.map((item) => item.name),
      connections: location.connections.map((connection) => connection.name),
    }))
    return json
  }
  buildMap() {
    const location_vonku = new Location(this, "Vonku")
    const location_chodba = new Location(this, "Chodba")
    const location_av = new Location(this, "AV")
    const location_bar = new Location(this, "Bar")
    const location_nad_schodami = new Location(this, "Nad schodami")
    const location_chodba_na_poschodi = new Location(this, "Chodba na poschodi")
    const location_vypoctovka = new Location(this, "Vypoctovka")
    const location_konstrukcia = new Location(this, "Konstrukcia")
    const location_zdravotnicka = new Location(this, "Zdravotnicka")
    const location_3d_tlac = new Location(this, "3D tlac")

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

    this.locations = [
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
  }

  getLocation(name = "") {
    return this.locations.find((l) => l.is(name))
  }

  getRandomLocation() {
    return sample(this.locations)
  }
}

module.exports = {
  Combat,
  Game,
  Item,
  Location,
  Map,
  Player,
  Profession,
}
