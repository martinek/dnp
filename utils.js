const fs = require("fs")

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

function loadJSON(json) {
  if (fs.existsSync(json)) {
    console.debug("Reading JSON from: " + json + " (debug)")
    return JSON.parse(fs.readFileSync(json))
  } else
    throw new Error(
      `File not found; PATH=${json}; Are you sure this file exists?`
    )
}

module.exports = {
  rand,
  arrayHash,
  sample,
  loadJSON,
}
