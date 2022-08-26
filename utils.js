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

module.exports = {
  rand,
  arrayHash,
  sample,
}
