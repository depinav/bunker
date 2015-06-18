bunker
======

Example Chat Application for angular-resource-sails

Install [mongodb](http://www.mongodb.org/downloads)

```npm install```

```node app.js```


Howto: Rebase your fork
======

Open Terminal, navigate to the solution folder and run the following

```git remote add upstream https://github.com/angular-resource-sails/bunker```

```git fetch upstream```

```git rebase upstream/master```


Howto: Use Browser-Sync
======

Type in Terminal

```browser-sync start --files "assets/styles/**" --proxy localhost:9002 --logLevel debug```
