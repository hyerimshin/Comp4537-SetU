const express = require("express");
const res = require("express/lib/response");
const mongoose = require("mongoose");
const app = express();
const port = 4000;
const https = require("https");
const axios = require("axios");
const { application } = require("express");

const url =
  "https://raw.githubusercontent.com/fanzeyi/pokemon.json/master/pokedex.json";

const myMongoDBConnction =
  "mongodb+srv://hyerim11:xXregBKpRhx4AldD@cluster0.qukhs.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";

app.listen(process.env.PORT || port, async () => {
  //1. establish the connection db
  //2. creat the scheme
  //3.create the model
  //4. populata the db with pokemons
  //   const conn = mongoose.createConnection(myMongoDBConnction);
  //   await conn.dropDatabase();
  //   mongoose.connection.db.dropDatabase("pokemon", () => {
  //     console.log("old pokemons collection is dropped.");
  //   });

  mongoose.connect(
    myMongoDBConnction,
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
    () => {
      console.log("connected to database myDb ;)");
    }
  );

  mongoose.connection.dropCollection("pokemons", () => {
    console.log("old pokemons collection is dropped.");
  });

  const possibleTypes = await axios.get(
    "https://raw.githubusercontent.com/fanzeyi/pokemon.json/master/types.json"
  );
  if (!possibleTypes || possibleTypes.status != 200 || !possibleTypes.data) {
    throw new Error("Error bootstraping pokemon data");
  }
  const types = possibleTypes.data.map((d) => d.english);

  const { Schema } = mongoose;

  const pokemonSchema = new Schema({
    base: {
      HP: Number,
      Attack: Number,
      Defense: Number,
      Speed: Number,
      "Speed Attack": Number,
      "Speed Defense": Number,
    },
    id: { type: Number, required: true, index: { unique: true } },
    name: {
      english: { type: String, maxLength: 20 },
      japanese: String,
      chinese: String,
      french: String,
    },
    type: {
      type: [String],
      enum: types,
    },
  });

  var pokemonModel = mongoose.model("pokemons", pokemonSchema);

  pokemonModel.diffIndexes();

  //grab the pokemons

  https.get(url, async (res) => {
    var chunks = "";
    res.on("data", function (chunk) {
      chunks += chunk;
    });
    res.on("end", function (data) {
      arr = JSON.parse(chunks);
      console.log(arr);
      arr.map((pokemon) => {
        pokemonModel.create(pokemon, function (err) {
          if (err) {
            console.log(err);
          }
        });
      });

      //middlewares
      app.use(express.json());

      //get pokemons
      getPokemons("/api/v1/pokemons", pokemonModel);

      //get a pokemon by id
      getPokemonById("/api/v1/pokemon/:id", pokemonModel);

      //get a pokemon image url
      getPokemonImage("/api/v1/pokemonImage/:id", pokemonModel);

      //post a new pokemon
      postNewPokemon("/api/v1/pokemon", pokemonModel);

      //update pokemon
      patchPokemon("/api/v1/pokemon/:id", pokemonModel);

      // delete pokemon
      deletePokemon("/api/v1/pokemon/:id", pokemonModel);

      //upsertPokemon
      upsertPokemon("/api/v1/pokemon/:id", pokemonModel);

      //The 404 Route (ALWAYS Keep this as the last route)
      app.get("*", function (req, res) {
        res.status(404).send({ msg: "Improper route. Check API docs plz." });
      });
    });
  });

  console.log(`Example app listening on port ${port}`);
});

function getPokemons(apiAddress, pokemonModel) {
  app.get("/api/v1/pokemons", (req, res) => {
    let query = pokemonModel.find({}).sort("id");

    if (req.query.after) {
      query = query.skip(req.query.after);
    }

    if (req.query.count) {
      query = query.limit(req.query.count);
    }
    query.exec().then((pokeDoc) => {
      if (pokeDoc.length > 0) {
        res.json(pokeDoc);
      } else {
        res.send({
          errMsg: "Error: no pokemon(s) found. Please check your params again.",
        });
      }
    });
  });
}

function getPokemonById(apiAdress, pokemonModel) {
  app.get("/api/v1/pokemon/:id", (req, res) => {
    pokemonModel
      .find({ id: `${req.params.id}` })
      .then((docs) => {
        if (docs != "") {
          res.json(docs);
        } else {
          res.json({ errMsg: "Pokemon not found" });
        }
      })
      .catch((err) => {
        res.json({ errMsg: "Cast Error: pass pokemon id between 1 and 811" });
      });
  });
}

function getPokemonImage(apiAddress, pokemonModel) {
  var pokemonImageUrlBase =
    "https://raw.githubusercontent.com/fanzeyi/pokemon.json/master/images/";
  app.get(apiAddress, (req, res) => {
    console.log(req.params.id);
    pokemonModel
      .find({ id: Number(`${req.params.id}`) })
      .then((doc) => {
        let pokemonImageUrl = "";
        let imageNumber = "";
        let pokemonId = req.params.id;
        if (0 < pokemonId < 10) {
          imageNumber = "00" + pokemonId.toString();
          pokemonImageUrl = pokemonImageUrlBase + imageNumber + ".png";
          if (10 < pokemonId < 100) {
            imageNumber = "0" + pokemonId.toString();
            pokemonImageUrl = pokemonImageUrlBase + imageNumber + ".png";
          } else {
            imageNumber = pokemonId.toString();
            pokemonImageUrl = pokemonImageUrlBase + imageNumber + ".png";
          }
        }
        res.json({ url: pokemonImageUrl });
      })
      .catch((err) => {
        console.error(err);
        res.json({ msg: "db reading .. err.  Check with server devs" });
      });
  });
}

function postNewPokemon(apiAdderss, pokemonModel) {
  app.post("/api/v1/pokemon", async (req, res) => {
    try {
      await pokemonModel.create(req.body);
      res.json({ msg: "Added Successfully" });
    } catch (error) {
      let findPokemon = await pokemonModel.findOne({ id: req.body.id });
      let pokeNameLength = req.body.name.english.length;

      if (pokeNameLength > 20) {
        res.json({ errMsg: "ValidationError: check your ..." });
      } else if (findPokemon) {
        res.json({ errMsg: "Pokemon Duplicate" });
      }
    }
  });
}

function patchPokemon(apiAdderss, pokemonModel) {
  app.patch(apiAdderss, (req, res) => {
    const { _id, ...rest } = req.body;
    pokemonModel.findOneAndUpdate(
      { id: Number(`${req.params.id}`) },
      { $set: { ...rest } },
      { runValidators: true },
      function (err, doc) {
        if (err) {
          return res.json({
            errMsg: "ValidationError: check your ...",
          });
        }
        console.log(doc);
        return res.json({ msg: "Updated Successfully", pokeInfo: doc });
      }
    );
  });
}

function deletePokemon(apiAdderss, pokemonModel) {
  app.delete("/api/v1/pokemon/:id", async (req, res) => {
    let pokeInfo = await pokemonModel.findOne({ id: req.body.id });
    pokemonModel.deleteOne({ id: req.params.id }, function (err, result) {
      if (result.deletedCount) {
        res.send({ msg: "Deleted Successfully", pokeInfo });
      } else {
        res.send({ errMsg: "Pokemon not found" });
      }
    });
  });
}

function upsertPokemon(apiAddress, pokemonModel) {
  app.put(apiAddress, (req, res) => {
    pokemonModel.findOneAndUpdate(
      { id: req.params.id },
      req.body,
      { upsert: true, new: true },
      function (err, doc) {
        if (err) {
          return res.json({
            errMsg: "ValidationError: check your ...",
          });
        }
        console.log(doc);
        return res.json({ msg: "Updated Successfully", pokemon: doc });
      }
    );
  });
}
