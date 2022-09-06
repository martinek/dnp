const Net = require("net")
const fs = require("fs")
const { Game, Player, Profession, Item } = require("./models")
const { loadJSON, getTranslationFromTranslations } = require("./utils")

const SERVER_FOLDER_PATH = "./server"
const SETTINGS = loadJSON(`${SERVER_FOLDER_PATH}/index.json`)
const COMMANDS = SETTINGS.command_aliases
const TRANSLATIONS = loadJSON(
  `${SERVER_FOLDER_PATH}/localization/${SETTINGS.server_settings.localization_used}.json`
)

const port = SETTINGS.server_settings.port
const server = new Net.Server()
const game = new Game(TRANSLATIONS, SETTINGS)
const admins = loadJSON("admins.json")

server.listen(port, function () {
  console.log(`Server listening on: ${port}.`)
})

const isBannedCommand = (alName) => SETTINGS.banned_commands.includes(alName)
const getCommandKey = (alName) =>
  Object.keys(COMMANDS).find((key) => COMMANDS[key] === alName)

const getTranslation = (translation, replacements = {}) => {
  let toReturn = getTranslationFromTranslations(
    TRANSLATIONS,
    translation,
    replacements
  )
  for (const element in COMMANDS)
    toReturn = toReturn.replaceAll(`%${element}%`, COMMANDS[element])
  return toReturn
}

// let counter = 0

server.on("connection", function (socket) {
  const player = new Player(socket, game)

  // TODO: Remove
  // // HACK: development
  // counter += 1
  // if (counter < 3) {
  //   if (counter == 1) {
  //     player.name = "Alice"
  //     player.pickClass("Konstrukter")
  //   }

  //   if (counter == 2) {
  //     player.name = "Bob"
  //     player.pickClass("Vypoctovkar")
  //   }

  //   player.location = game.map.getRandomLocation()
  //   player.look()
  //   player.location.notifyEntering(player)
  // }
  // // END HACK: development

  game.players.push(player)
  console.log("A new connection has been established.")

  if (player.name === undefined) {
    player.tell(getTranslation("server.player.change_name_message"))
  }

  socket.on("data", function (chunk) {
    let input = chunk.toString().trim()

    if (player.name === undefined) {
      player.name = input
      player.tell(
        getTranslation("server.welcome_message", { player: player.name })
      )
      if (admins.find((e) => e.name === player.name) !== undefined) {
        player.tell(getTranslation("server.player.admin.password_message"))
        player.admin = null
        return
      }
      player.admin = false
      Profession.explain(player)
      console.log(`Player ${player.name} connected`)
      return
    }
    if (player.admin === null) {
      if (admins.find((e) => e.name === player.name).pwd === input) {
        player.tell(getTranslation("server.player.admin.login_complete"))
        player.admin = true
        Profession.explain(player)
        console.log(`Player ${player.name} connected`)
      } else {
        player.tell(getTranslation("server.player.admin.login_failed"))
      }
      return
    }

    if (player.class === undefined) {
      if (player.pickClass(input)) {
        player.location = game.map.getRandomLocation()
        player.look()
        player.location.notifyEntering(player)
        return // Class name would execute as command, issue discovered after implementing 'server__player_interaction_inv_command'
      } else {
        Profession.explain(player)
        return
      }
    }

    if (input === COMMANDS.REPEAT) {
      input = player.lastInput
    }

    const [command, ...args] = input.split(" ")
    if (player.isDead) {
      player.tell(getTranslation("server.player.death_message"))
      return
    }

    if (isBannedCommand(getCommandKey(command))) {
      player.tell(getTranslation("server.player.disabled_command_message"))
      return
    }

    switch (command) {
      case COMMANDS.HELP:
        player.tell(
          getTranslation("server.help_message", { devider: "=============" })
        )
        break

      case COMMANDS.LOOK:
        player.look()
        break

      case COMMANDS.GO:
        player.go(args.join(" "))
        break

      case COMMANDS.SAY:
        player.say(args.join(" "))
        break

      case COMMANDS.YELL:
        player.yell(args.join(" "))
        break

      case COMMANDS.STATS:
        player.stats()
        break

      case COMMANDS.CHALLENGE:
        player.challenge(args.join(" "))
        break

      case COMMANDS.ACCEPT:
        player.accept()
        break

      case COMMANDS.DECLINE:
        player.decline()
        break

      case COMMANDS.ATTACK:
        player.executeAttack(args[0])
        break

      case COMMANDS.BUFF:
        player.executeBuff()
        break

      case COMMANDS.CLASSES:
        Profession.explain(player)
        break

      case COMMANDS.PICK:
        player.pick(args.join(" "))
        break

      case COMMANDS.DROP:
        player.drop(args.join(" "))
        break

      case COMMANDS.INVENTORY:
        player.showInventory()
        break

      case COMMANDS.USE:
        // .use pocitac, ev3 kocka, foo, booo
        // tool = "pocitac", material = "ev3 kocka"
        const [tool, material] = args
          .join(" ")
          .split(",")
          .map((s) => s.trim())
        player.use(tool, material)
        break

      case COMMANDS.GIVE:
        if (!player.checkAdmin()) return
        player.inventory.push(new Item(args.join(" ")))
        break
      case COMMANDS.SAVE:
        if (!player.checkAdmin()) return
        fs.writeFileSync(
          "map.json",
          JSON.stringify(game.map.saveToJson(), null, " ")
        )
        break
      case COMMANDS.LOAD:
        if (!player.checkAdmin()) return
        game.reloadFromJson(JSON.parse(fs.readFileSync("map.json")))
        break

      case COMMANDS.COMBINE:
        // .combine lego kocka ,lego kocka, lego kocka, lego kocka
        const ingredients = args
          .join(" ")
          .split(",")
          .map((s) => s.trim())
        player.combine(ingredients)
        break

      case COMMANDS.DEBUG_LOCATIONS:
        game.debugLocations()
        break

      case COMMANDS.TP:
        const newLocation = game.map.getLocation(args.join(" "))
        if (newLocation) {
          player.location = newLocation
        } else {
          player.tell(getTranslation("server.player.invalid_location_message"))
        }
        break

      case COMMANDS.HIT:
        player.health -= Number(args[0])
        break

      default: {
        player.tell(getTranslation("server.player.invalid_command_message"))
        return
      }
    }
    console.log(`Player ${player.name}: ${command}`)

    player.lastInput = input
  })

  socket.on("end", function () {
    console.log(`Player disconnected: ${player.name}`)
    player.dropAllItems()
  })
})
