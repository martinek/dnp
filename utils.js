const fs = require("fs")

const FILE_INFO_MESSAGES = true

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

function readJson(json) {
  if (fs.existsSync(json)) {
    if (FILE_INFO_MESSAGES) {
      console.log(
        "Reading JSON from: " +
          json +
          " ... in order to disable this message please change 'FILE_INFO_MESSAGES' in 'utils.js'"
      )
    }
    return JSON.parse(fs.readFileSync(json))
  } else
    throw new Error(
      `Couldn't read JSON from system-required json; PATH=${json}; Are you sure this file exists?`
    )
}

module.exports = {
  rand,
  arrayHash,
  sample,
  readJson,
}
