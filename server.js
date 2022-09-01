const Net = require("net")
const { Game, Player, Profession } = require("./models")
const { readJson } = require("./utils")

const SERVER_FOLDER_PATH = "./server"

const SETTINGS = readJson(`${SERVER_FOLDER_PATH}/index.json`)
const TRANSLATIONS = readJson(
  `${SERVER_FOLDER_PATH}/localization/${SETTINGS.server_settings.localization_used}.json`
)

const port = SETTINGS.server_settings.port
const server = new Net.Server()
const game = new Game(TRANSLATIONS, SETTINGS)

server.listen(port, function () {
  console.log(`Server listening on: ${port}.`)
})

const getCommandAlias = (alName) => {
  return SETTINGS.command_aliases[alName]
}

const isBannedCommand = (alName) => {
  for (const element of SETTINGS.paused_commands) {
    if (element === alName) return true
  }
  return false
}

const getTranslation = (translation) => {
  let toReturn = TRANSLATIONS[translation]

  for (const element in SETTINGS.command_aliases)
    toReturn = toReturn.replaceAll(`%${element}%`, getCommandAlias(element))

  return toReturn
}

let counter = 0

server.on("connection", function (socket) {
  const player = new Player(socket)

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
        player.location = game.map.getRandomLocation()
        player.look()
        player.location.notifyEntering(player)
        return // Class name would execute as command, issue discovered after implementing 'server__player_interaction_inv_command'
      } else {
        Profession.explain(player)
        return
      }
    }

    if (input === getCommandAlias(".r")) {
      input = player.lastInput
    }

    const [command, ...args] = input.split(" ")
    if (player.isDead) {
      player.tell("Dead man tells no tales")
      return
    }

    if (isBannedCommand(getCommandAlias(command))) {
      player.tell(getTranslation("server__player_interaction_disabled_command"))
      return
    }

    switch (command) {
      case getCommandAlias(".help"):
        player.tell(
          getTranslation("help_message").replaceAll("%devider", "=============")
        )
        break

      case getCommandAlias(".look"):
        player.look()
        break

      case getCommandAlias(".go"):
        player.go(args.join(" "))
        break

      case getCommandAlias(".say"):
        player.say(args.join(" "))
        break

      case getCommandAlias(".yell"):
        player.yell(args.join(" "))
        break

      case getCommandAlias(".stats"):
        player.stats()
        break

      case getCommandAlias(".challenge"):
        player.challenge(args.join(" "))
        break

      case getCommandAlias(".accept"):
        player.accept()
        break

      case getCommandAlias(".decline"):
        player.decline()
        break

      case getCommandAlias(".attack"):
        player.executeAttack(args[0])
        break

      case getCommandAlias(".buff"):
        player.executeBuff()
        break

      case getCommandAlias(".classes"):
        Profession.explain(player)
        break

      case getCommandAlias(".pick"):
        player.pick(args.join(" "))
        break

      case getCommandAlias(".drop"):
        player.drop(args.join(" "))
        break

      case getCommandAlias(".inventory"):
        player.showInventory()
        break

      case getCommandAlias(".use"):
        // .use pocitac, ev3 kocka, foo, booo
        // tool = "pocitac", material = "ev3 kocka"
        const [tool, material] = args
          .join(" ")
          .split(",")
          .map((s) => s.trim())
        player.use(tool, material)
        break

      case getCommandAlias(".combine"):
        // .combine lego kocka ,lego kocka, lego kocka, lego kocka
        const ingredients = args
          .join(" ")
          .split(",")
          .map((s) => s.trim())
        player.combine(ingredients)
        break

      case getCommandAlias(".debug_locations"):
        game.debugLocations()
        break

      case getCommandAlias(".tp"):
        const newLocation = game.map.getLocation(args.join(" "))
        if (newLocation) {
          player.location = newLocation
        } else {
          player.tell(getTranslation("server__player_interaction_inv_location"))
        }
        break

      case getCommandAlias(".hit"):
        player.health -= Number(args[0])
        break

      default: {
        player.tell(getTranslation("server__player_interaction_inv_command"))
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
