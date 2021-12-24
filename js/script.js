console.log('hello')


/*
========================================================================== */
function removeFavicon() {
    let links = document.getElementsByTagName('link');
    let head = document.getElementsByTagName('head')[0];
    for (let i = 0; i < links.length; i++) {
        if (links[i].getAttribute('rel') === 'icon') {
            head.removeChild(links[i])
        }
    }
}

function setFavicon(url) {
    removeFavicon();
    let link = document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'icon';
    link.href = url;
    document.getElementsByTagName('head')[0].appendChild(link);
}

let faviconsIndex = 0;
let faviconsList = ['favicon-1.ico', 'favicon-2.ico']
function changeFavicon() {
    setFavicon('assets/images/favicons/' + faviconsList[faviconsIndex])
    faviconsIndex++
    if (faviconsIndex > faviconsList.length - 1) faviconsIndex = 0;
}
let faviconLoop = setInterval(changeFavicon, 1000)

/*
========================================================================== */
function changeBorder() {
    $('.arena').hasClass('border1')
        ? $('.arena').removeClass('border1')
        : $('.arena').addClass('border1')
    $('.arena').hasClass('border2')
        ? $('.arena').removeClass('border2')
        : $('.arena').addClass('border2')
}
let borderLoop = setInterval(changeBorder, 500)

/*
========================================================================== */
let DIFFICULTY = 2 //how fast the game gets more difficult
let DOT_TIME = 110 //aprox tick count until a new asteroid gets introduced
let SUB_DOT_COUNT = 4 //how many small dots to make on dot death
let BULLET_TIME = 5 //ticks between bullets
let BULLET_ENTROPY = 100 //how much energy a bullet has before it runs out.

let TURN_FACTOR = 7 //how far the cursor turns per frame
let BULLET_SPEED = 17 //how fast the bullets move

let KEYCODE_ENTER = 13 //useful keycode
let KEYCODE_SPACE = 32 //useful keycode
let KEYCODE_UP = 38 //useful keycode
let KEYCODE_LEFT = 37 //useful keycode
let KEYCODE_RIGHT = 39 //useful keycode
let KEYCODE_W = 87 //useful keycode
let KEYCODE_A = 65 //useful keycode
let KEYCODE_D = 68 //useful keycode

let images
let manifest // used to register sounds for preloading
let preload

let shootHeld //is the user holding a shoot command
let lfHeld //is the user holding a turn left command
let rtHeld //is the user holding a turn right command
let fwdHeld //is the user holding a forward command

let timeToDot //difficulty adjusted version of DOT_TIME
let timeToPowerUp //difficulty adjusted version of DOT_TIME
let nextDot //ticks left until a new dot arrives
let nextBullet //ticks left until the next shot is fired
let nextPowerUp //ticks left until a new powerUp arrives

let dotBelt //dot array
let bulletStream //bullet array
let powerUpList //powerUp array

let canvas //Main canvas
let stage //Main display stage

let cursor //the actual cursor
let alive //wheter the player is alive

let messageField //Message display field
let scoreField //score Field

let loadingInterval = 0

//register key functions
document.onkeydown = handleKeyDown
document.onkeyup = handleKeyUp

function fitToContainer(canvas) {
    let borderSize = 2 * 30;
    canvas.style.width = '100%'
    canvas.style.height = '100%'

    canvas.width = canvas.offsetWidth + borderSize
    canvas.height = canvas.offsetHeight + borderSize
    canvas.style.width = canvas.offsetWidth + borderSize + 'px'
    canvas.style.height = canvas.offsetHeight + borderSize + 'px'
}

function init() {
    // if (!createjs.Sound.initializeDefaultPlugins()) {
    //     document.getElementById("error").style.display = "block";
    //     document.getElementById("content").style.display = "none";
    //     return;
    // }

    // if (createjs.BrowserDetect.isIOS || createjs.BrowserDetect.isAndroid || createjs.BrowserDetect.isBlackberry) {
    //     document.getElementById("mobile").style.display = "block";
    //     document.getElementById("content").style.display = "none";
    //     return;
    // }

    canvas = document.getElementById('gameCanvas')
    fitToContainer(canvas)
    stage = new createjs.Stage(canvas)
    messageField = new createjs.Text('Loading', 'bold 18px Arial', '#000000')
    messageField.maxWidth = 1000
    messageField.textAlign = 'center'
    messageField.textBaseline = 'middle'
    messageField.x = canvas.width / 2
    messageField.y = canvas.height / 2
    stage.addChild(messageField)
    stage.update() //update the stage to show text

    // begin loading content (only sounds to load)
    let assetsPath = 'assets/'
    images = images || {}
    manifest = [
        //     {id: "begin", src: "spawn.ogg"},
        //     {id: "break", src: "break.ogg", data: 6},
        //     {id: "death", src: "death.ogg"},
        //     {id: "laser", src: "shot.ogg", data: 6},
        //     {id: "music", src: "music.ogg"}
        { id: 'cursor', src: 'images/cursor.png' },
        { id: 'dot', src: 'images/dot-sprites.png' },
        { id: 'powerUp1', src: 'images/powerUp1.png' }
    ]

    // createjs.Sound.alternateExtensions = ["mp3"];
    preload = new createjs.LoadQueue(true, assetsPath)
    // preload.installPlugin(createjs.Sound);
    preload.addEventListener('fileload', handleFileLoad)
    preload.addEventListener('complete', doneLoading) // add an event listener for when load is completed
    preload.addEventListener('progress', updateLoading)
    preload.loadManifest(manifest)

    //   doneLoading()
}

function stop() {
    if (preload != null) {
        preload.close()
    }
    // createjs.Sound.stop();
}

function handleFileLoad(o) {
    if (o.item.type == 'image') {
        images[o.item.id] = o.result
    }
}

function updateLoading() {
    messageField.text = 'Loading ' + ((preload.progress * 100) | 0) + '%'
    stage.update()
}

function doneLoading(event) {
    clearInterval(loadingInterval)
    // scoreField = new createjs.Text("0", "bold 18px Arial", "#FFFFFF");
    // scoreField.textAlign = "right";
    // scoreField.x = canvas.width - 20;
    // scoreField.y = 20;
    // scoreField.maxWidth = 1000;

    messageField.text = 'Click to play'

    // start the music
    // createjs.Sound.play("music", {interrupt: createjs.Sound.INTERRUPT_NONE, loop: -1, volume: 0.4});

    watchRestart()
}

function watchRestart() {
    //watch for clicks
    stage.addChild(messageField)
    stage.update() //update the stage to show text
    canvas.onclick = handleClick
}

function handleClick() {
    //prevent extra clicks and hide text
    canvas.onclick = null
    stage.removeChild(messageField)

    // indicate the player is now on screen
    // createjs.Sound.play("begin");

    restart()
}

//reset all game logic
function restart() {
    //hide anything on stage and show the score
    stage.removeAllChildren()
    // scoreField.text = (0).toString();
    // stage.addChild(scoreField);

    //new arrays to dump old data
    dotBelt = []
    bulletStream = []
    powerUpList = []

    //create the player
    alive = true
    cursor = new Cursor(images)
    cursor.x = canvas.width / 2
    cursor.y = canvas.height / 2

    //log time untill values
    timeToDot = DOT_TIME
    nextDot = nextBullet = nextPowerUp = 0

    //reset key presses
    shootHeld = lfHeld = rtHeld = fwdHeld = dnHeld = false

    //ensure stage is blank and add the cursor
    stage.clear()
    stage.addChild(cursor)

    //start game timer
    createjs.Ticker.setFPS(60);
    if (!createjs.Ticker.hasEventListener('tick')) {
        createjs.Ticker.addEventListener('tick', tick)
    }
}

function tick(event) {
    //handle firing
    if (nextBullet <= 0) {
        if (alive && shootHeld) {
            nextBullet = BULLET_TIME
            fireBullet()
        }
    } else {
        nextBullet--
    }

    //handle turning
    if (alive && lfHeld) {
        cursor.rotation -= TURN_FACTOR
    } else if (alive && rtHeld) {
        cursor.rotation += TURN_FACTOR
    }

    //handle thrust
    if (alive && fwdHeld) {
        cursor.accelerate()
    }

    //handle new dot
    if (nextDot <= 0) {
        if (alive) {
            timeToDot -= DIFFICULTY //reduce dot spacing slowly to increase difficulty with time
            dotBelt.push(new Dot(images, canvas.height, canvas.width));
            stage.addChild(dotBelt[dotBelt.length - 1])
            nextDot = timeToDot + timeToDot * Math.random();
        }
    } else {
        nextDot--
    }

    //handle new powerUp
    if (nextPowerUp <= 0) {
        if (alive) {
            timeToPowerUp -= DIFFICULTY
            powerUpList.push(new PowerUp1(images, canvas.height, canvas.width));
            stage.addChild(powerUpList[powerUpList.length - 1])
            nextPowerUp = timeToPowerUp + timeToPowerUp * Math.random();
        }
    } else {
        nextPowerUp--
    }


    //handle cursor looping
    if (alive && outOfBounds(cursor, cursor.bounds)) {
        placeInBounds(cursor, cursor.bounds)
    }

    //handle bullet movement and looping
    // for (bullet in bulletStream) {
    //     let o = bulletStream[bullet]
    //     if (!o || !o.active) {
    //         continue
    //     }
    //     if (outOfBounds(o, cursor.bounds)) {
    //         placeInBounds(o, cursor.bounds)
    //     }
    //     o.x += Math.sin(o.rotation * (Math.PI / -180)) * BULLET_SPEED
    //     o.y += Math.cos(o.rotation * (Math.PI / -180)) * BULLET_SPEED

    //     if (--o.entropy <= 0) {
    //         stage.removeChild(o)
    //         o.active = false
    //     }
    // }

    for (dot in dotBelt) {
        let o = dotBelt[dot];

        if (!o || !o.active) {
            continue;
        }
        
        //handle dot movement and looping
        // if (outOfBounds(o, o.bounds)) {
        //     placeInBounds(o, o.bounds)
        // }
        o.tick(event, cursor.x, cursor.y);

        // dotBelt[index].floatOnScreen(canvas.width, canvas.height)

        //handle dot cursor collisions
        // if (alive && o.hitRadius(cursor.x, cursor.y, cursor.hit)) {
        //     alive = false

        //     stage.removeChild(cursor)
        //     messageField.text = "You're dead:  Click or hit enter to play again"
        //     stage.addChild(messageField)
        //     watchRestart()

        //     //play death sound
        //     // createjs.Sound.play("death", {interrupt: createjs.Sound.INTERRUPT_ANY});
        //     continue
        // }

        //handle dot bullet collisions
        // for (bullet in bulletStream) {
        //     let p = bulletStream[bullet]
        //     if (!p || !p.active) {
        //         continue
        //     }

        //     if (o.hitPoint(p.x, p.y)) {
        //         //score
        //         if (alive) {
        //             addScore(o.score)
        //         }

        //         //remove
        //         stage.removeChild(o)
        //         dotBelt[dot].active = false

        //         // play sound
        //         // createjs.Sound.play("break", {interrupt: createjs.Sound.INTERUPT_LATE, offset: 0.8});
        //     }
        // }
    }

    //handle dots (nested in one loop to prevent excess loops)
    for (powerUp in powerUpList) {
        let o = powerUpList[powerUp];

        if (!o || !o.active) {
            continue;
        }

        o.tick(event, cursor.x, cursor.y);
        //handle dot cursor collisions
        if (alive && o.hitRadius(cursor.x, cursor.y, cursor.hit)) {
            alive = false

            stage.removeChild(o)
        }
    }

    //call sub ticks
    cursor.tick(event)
    stage.update(event)
}

function outOfBounds(o, bounds) {
    //is it visibly off screen
    return (
        o.x < bounds * -2 ||
        o.y < bounds * -2 ||
        o.x > canvas.width + bounds * 2 ||
        o.y > canvas.height + bounds * 2
    )
}

function placeInBounds(o, bounds) {
    //if its visual bounds are entirely off screen place it off screen on the other side
    if (o.x > canvas.width + bounds * 2) {
        console.log("Bounds1: ", bounds * 2)
        o.x = canvas.width + bounds * -2
    } else if (o.x < bounds * -2) {
        console.log("Bounds2: ", bounds * 2)
        o.x = bounds * 2
    }

    //if its visual bounds are entirely off screen place it off screen on the other side
    if (o.y > canvas.height + bounds * 2) {
        console.log("Bounds3: ", bounds * 2)
        o.y = canvas.height + bounds * -2
    } else if (o.y < bounds * -2) {
        console.log("Bounds4: ", bounds * 2)
        o.y = bounds * 2
    }
}

// function fireBullet() {
//     //create the bullet
//     let o = bulletStream[getBullet()]
//     o.x = cursor.x
//     o.y = cursor.y
//     o.rotation = cursor.rotation
//     o.entropy = BULLET_ENTROPY
//     o.active = true

//     //draw the bullet
//     o.graphics.beginStroke('#FFFFFF').moveTo(-1, 0).lineTo(1, 0)

//     // play the shot sound
//     // createjs.Sound.play("laser", {interrupt: createjs.Sound.INTERUPT_LATE});
// }

function getDot(images) {
    let i = 0
    let len = dotBelt.length

    // pooling approach
    while (i <= len) {
        if (!dotBelt[i]) {
            // dotBelt[i] = new Dot(images)
            break;
        } else if (!dotBelt[i].active) {
            dotBelt[i].activate(size);
            break;
        } else {
            i++
        }
    }

    if (len == 0) {
        dotBelt[0] = new Dot(images)
    }

    stage.addChild(dotBelt[i])
    return i
}

// function getBullet() {
//     let i = 0
//     let len = bulletStream.length

//     //pooling approach
//     while (i <= len) {
//         if (!bulletStream[i]) {
//             bulletStream[i] = new createjs.Shape()
//             break
//         } else if (!bulletStream[i].active) {
//             bulletStream[i].active = true
//             break
//         } else {
//             i++
//         }
//     }

//     if (len == 0) {
//         bulletStream[0] = new createjs.Shape()
//     }

//     stage.addChild(bulletStream[i])
//     return i
// }

//allow for WASD and arrow control scheme
function handleKeyDown(e) {
    //cross browser issues exist
    if (!e) {
        let e = window.event
    }
    switch (e.keyCode) {
        case KEYCODE_SPACE:
            shootHeld = true
            return false
        case KEYCODE_A:
        case KEYCODE_LEFT:
            lfHeld = true
            return false
        case KEYCODE_D:
        case KEYCODE_RIGHT:
            rtHeld = true
            return false
        case KEYCODE_W:
        case KEYCODE_UP:
            fwdHeld = true
            return false
        case KEYCODE_ENTER:
            if (canvas.onclick == handleClick) {
                handleClick()
            }
            return false
    }
}

function handleKeyUp(e) {
    //cross browser issues exist
    if (!e) {
        let e = window.event
    }
    switch (e.keyCode) {
        case KEYCODE_SPACE:
            shootHeld = false
            break
        case KEYCODE_A:
        case KEYCODE_LEFT:
            lfHeld = false
            break
        case KEYCODE_D:
        case KEYCODE_RIGHT:
            rtHeld = false
            break
        case KEYCODE_W:
        case KEYCODE_UP:
            fwdHeld = false
            break
    }
}

function addScore(value) {
    //trust the field will have a number and add the score
    // scoreField.text = (Number(scoreField.text) + Number(value)).toString();
}
