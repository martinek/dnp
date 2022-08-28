const Net = require("net")
const { Game, Player, Profession } = require("./models")
const port = 8080

const server = new Net.Server()
const game = new Game()

server.listen(port, function () {
  console.log(`Server listening on:${port}.`)
})

let counter = 0

server.on("connection", function (socket) {
  const player = new Player(socket)

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
      } else {
        Profession.explain(player)
        return
      }
    }

    if (input === ".r") {
      input = player.lastInput
    }

    const [command, ...args] = input.split(" ")
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
  .pick <item name> - zdvihne <item name>
  .drop <item name> - zahodi <item name>
  .combine <item name>, <item name>, ... - skombinuje zadane polozky
  .recepies - vypise recepty // TODO
  .say - povie do lokacie // DISABLED
  .yell - povie vsetkym hracom // DISABLED
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

      // case ".say":
      //   player.say(args.join(" "))
      //   break

      // case ".yell":
      //   player.yell(args.join(" "))
      //   break

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
        game.debugLocations()
        break

      case ".tp":
        const newLocation = game.map.getLocation(args.join(" "))
        if (newLocation) {
          player.location = newLocation
        } else {
          player.tell("invalid location")
        }
        break

      case ".hit":
        player.health -= Number(args[0])
        break

      default:
        return
        break
    }
    console.log(`Player ${player.name}: ${command}`)

    player.lastInput = input
  })

  socket.on("end", function () {
    console.log(`Player disconnected: ${player.name}`)
    player.dropAllItems()
  })
})
