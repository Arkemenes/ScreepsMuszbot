Spawn.prototype.spawnCreepsIfNecessary =
    function () {

        // If busy, there is nothing to do
        if (this.spawning) {
            return;
        }

        // the number of miners is set as the number of containers
        let targetNumbers = {}
        targetNumbers['miner'] = Memory.rooms[this.room.name].numberOfContainers;

        // The number of each worker is set depending on the number os sources in this room and the controller level
        switch (this.room.controller.level) {
            case 1:
                targetNumbers['harvester'] = Math.ceil(4 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(3 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['defenders'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;
            case 2:
                targetNumbers['harvester'] = Math.ceil(4 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(4 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(3 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['defenders'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;
            case 3:
                targetNumbers['harvester'] = Math.ceil(3 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(9 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['defenders'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;
            case 4:
                targetNumbers['harvester'] = Math.ceil(4 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(4 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['defenders'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;
            case 5:
                targetNumbers['harvester'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['defenders'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;

            case 6:
                targetNumbers['harvester'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['defenders'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;

            case 7:
                targetNumbers['harvester'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['defenders'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;

            case 8:
                targetNumbers['harvester'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['builder'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['upgrader'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['wall_repairer'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['transporter'] = Math.ceil(2 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['scout'] = Math.ceil(0 / (3 - Memory.rooms[this.room.name].sourceNumber));
                targetNumbers['defenders'] = Math.ceil(1 / (3 - Memory.rooms[this.room.name].sourceNumber));
                break;
            default:
                break;
        }

        if (Memory.rooms[this.room.name].numberOfHarvesters == 0) {

            // If there is no available harvester in this room, try to create a new one
            var energy = Math.max(this.room.energyAvailable, 201);
            if (this.generateCreep('harvester', energy) != 0) {

                // if the spawn has failed, transform a valid creep on harvester
                let newHarvester = this.room.find(FIND_MY_CREEPS, {
                                                filter: (creep) =>  creep.memory.role != 'claimer' &&
                                                                    creep.memory.role != 'logistic' &&
                                                                    creep.memory.role != 'miner' &&
                                                                    creep.memory.role != 'scout' &&
                                                                    creep.memory.role != 'transporter'})[0];
                if (newHarvester) {
                    newHarvester.memory.role = 'harvester';
                    newHarvester.memory.action = undefined;
                    newHarvester.memory.target = undefined;
                    Memory.rooms[this.room.name].numberOfHarvesters++;
                }
            } else {
                Memory.rooms[this.room.name].numberOfHarvesters++;
            }
        } else {
            var energy = Math.min(Math.max(this.room.energyAvailable, 250),0.7 * this.room.energyCapacityAvailable);
        }

        // If there is an enemy in map, spawn defenders
        if (Memory.rooms[this.room.name] && Memory.rooms[this.room.name].numberOfDefenders < Math.min(5,Memory.rooms[this.room.name].enemies)) {
            if (this.generateCreep('defender', energy) == 0) {
                Memory.rooms[this.room.name].numberOfDefenders++;
            }
        }


        // If there is a dying creep that is fully created, renew it
        let dyingCreep = this.pos.findInRange(FIND_MY_CREEPS, 1, {
            filter: (c) => c.ticksToLive <= 300 &&
                (c.body.length >= 33 ||
                    (c.getActiveBodyparts(MOVE) == 0 &&
                        c.getActiveBodyparts(CARRY) >= 16))})[0];

        if (dyingCreep && this.room.energyAvailable >= 0.8 * this.room.energyCapacityAvailable) {
            this.renewCreep(dyingCreep);
        } 
        // If there is less miners than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfMiners < targetNumbers['miner']) {

            if (this.generateCreep('miner', energy) == 0) {
                Memory.rooms[this.room.name].numberOfMiners++;
            }
        } 
        
        // If there is less harvesters than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfHarvesters < targetNumbers['harvester']) {

            if (this.generateCreep('harvester', energy) == 0) {
                Memory.rooms[this.room.name].numberOfHarvesters++;
            }

        }
        
        // If there is less builders than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfBuilders < targetNumbers['builder']) {

            if (this.generateCreep('builder', energy) == 0) {
                Memory.rooms[this.room.name].numberOfBuilders++;
            }
        } 
        
        // If there is less upgraders than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfUpgraders < targetNumbers['upgrader']) {

            if (this.generateCreep('upgrader', energy) == 0) {
                Memory.rooms[this.room.name].numberOfUpgraders++;
            }
        } 
        
        // If there is less repairers than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfRepairers < targetNumbers['repairer']) {
            if (this.generateCreep('repairer', energy) == 0) {
                Memory.rooms[this.room.name].numberOfRepairers++;
            }
        }

        // If there is less wall repairers than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfWallRepairers < targetNumbers['wall_repairer']) {

            if (this.generateCreep('wallRepairer', energy) == 0) {
                Memory.rooms[this.room.name].numberOfWallRepairers++;
            }
        } 

        // If there is less defenders than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfDefenders < targetNumbers['defenders'] && energy > 410) {

        if (this.generateCreep('defender', energy) == 0) {
            Memory.rooms[this.room.name].numberOfDefenders++;
        }
    }
        
        // If there is less transporters than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfTransporters < targetNumbers['transporter'] && this.room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType == STRUCTURE_STORAGE && s.isActive()
            })[0]) {

            if (this.generateCreep('transporter', energy) == 0) {
                Memory.rooms[this.room.name].numberOfTransporters++;
            }
        } 
        
        // If there is no logistics and the room have a storage and the spawn is above center, create a new one
        else if (Memory.rooms[this.room.name].numberOfLogistics == 0 && Memory.rooms[this.room.name].numberOfLinks &&
            this.pos.x == Memory.rooms[this.room.name].center[0] && this.pos.y+1 == Memory.rooms[this.room.name].center[1]) {
            var body = createBody([CARRY, WORK, CARRY, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);
            if (this.generateCreep('logistic', energy) == 0) {
                Memory.rooms[this.room.name].numberOfLogistics++;
            }
        } 
        
        // If there is less scouts than target, create a new one
        else if (Memory.rooms[this.room.name].numberOfScouts < targetNumbers['scout']) {

            if (this.generateCreep('scout', energy) == 0) {
                Memory.rooms[this.room.name].numberOfScouts++;
            }
        } else {

            Memory.rooms[this.room.name].exits = _.sortBy(Memory.rooms[this.room.name].exits, e => (Memory.rooms[e] && Memory.rooms[e].sourceNumber) ? Memory.rooms[e].sourceNumber : 0).reverse();
            // If the room has all the workers, create workers for nearby rooms
            for (let exitId in Memory.rooms[this.room.name].exits) {

                let exit = Memory.rooms[this.room.name].exits[exitId];

                if (Memory.rooms[exit] && Memory.rooms[exit].numberOfDefenders < Math.max(Memory.rooms[exit].enemies, Memory.rooms[exit].enemyStructures)) {
                    if (this.generateCreep('defender', energy, exit) == 0) {
                        Memory.rooms[exit].numberOfDefenders++;
                    }
                }

                // Only create long distance workers if there is no enemies on that room
                else if (Memory.rooms[exit] && !Memory.rooms[exit].owner) {
                    let exit = Memory.rooms[this.room.name].exits[exitId];

                    // If the room is mine and has less than 1 and has a construction site, create a remote one
                    if (Memory.rooms[exit].numberOfBuilders < 1 && Game.rooms[exit] && Game.rooms[exit].find(FIND_CONSTRUCTION_SITES)[0]) {
                        if (this.generateCreep('builder', energy, exit) == 0) {
                            Memory.rooms[exit].numberOfBuilders++;
                        }
                    } 
                    
                    // If the room is mine or reserved for me and has less than source number, create a remote one
                    else if (Memory.rooms[exit].numberOfHarvesters < Memory.rooms[exit].sourceNumber - Memory.rooms[exit].numberOfMiners) {
                        if (this.generateCreep('harvester', energy, exit) == 0) {
                            Memory.rooms[exit].numberOfHarvesters++;
                        }

                    }

                    // If the room is mine and has less than 1 and has a construction site, create a remote one
                    else if (Memory.rooms[exit].numberOfRepairers < 1 && Game.rooms[exit] && 
                            (Game.rooms[exit].find(FIND_STRUCTURES, {filter : (s) => s.my || !s.owner })[0])) {
                        if (this.generateCreep('repairer', energy, exit) == 0) {
                            Memory.rooms[exit].numberOfRepairers++;
                        }
                    } 

                    // If the room is mine and has less miners than containers, create a remote one
                    else if (Memory.rooms[exit].numberOfMiners < Memory.rooms[exit].numberOfContainers) {
                        if (Memory.rooms[exit].my) {
                            var body = createBody([MOVE, WORK, WORK, WORK, WORK, WORK, MOVE], energy);
                        }
                        else {
                            var body = createBody([MOVE, WORK, WORK, WORK, MOVE], energy);
                        }

                        if (this.generateCreep('miner', energy, exit, body) == 0) {
                            Memory.rooms[exit].numberOfMiners++;
                        }
                    } 

                    // If the room is mine and has less transporters than containers, create a remote one
                    if (Memory.rooms[exit].numberOfTransporters < Memory.rooms[exit].numberOfMiners * 2 && Game.rooms[this.room.name].storage) {
                        if (this.generateCreep('transporter', energy, exit) == 0) {
                            Memory.rooms[exit].numberOfTransporters++;
                        }
                    } 

                    // If can claim that room, create a claimer
                    else if (Memory.myRooms.length < Game.gcl &&
                        !Memory.rooms[exit].numberOfClaimers &&
                        Memory.rooms[exit].hasController &&
                        Memory.rooms[exit].center &&
                        energy > 800 &&
                        (!Memory.rooms[exit].owner ||
                            (Memory.rooms[exit].owner &&
                                Memory.rooms[exit].owner.username != "Arkemenes"))) {

                        if (this.generateCreep('claimer', energy, exit) == 0) {
                            Memory.rooms[exit].numberOfClaimers++;
                            console.log('building new claimer from ' + this.room.name + ' to room ' + exit)
                        }
                        
                    } 
                    
                    // If cannot claim that room, but can reserve it, also create a claimer
                    else if (!Memory.rooms[exit].numberOfClaimers &&
                                Memory.rooms[exit].hasController &&
                                Memory.rooms[exit].sourceNumber >= 2 &&
                                !Memory.rooms[exit].my &&
                                this.room.energyAvailable > 1300) {

                        if (this.generateCreep('claimer', energy, exit) == 0) {
                            Memory.rooms[exit].numberOfClaimers++;
                            console.log('building new reserver from ' + this.room.name + ' to room ' + exit);
                        }
                        
                    }

                }

            }
        }
            
        // if there is nothing more to build and has left energy on containers, build another upgrader
        if (!this.spawning &&
            this.room.energyAvailable > 0.9 * this.room.energyCapacityAvailable &&
             _.sum(this.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_STORAGE}), (s) => s.store.energy > 1000 * Memory.rooms[this.room.name].sourceNumber)) {

            if (this.generateCreep('upgrader', energy) == 0) {
                Memory.rooms[this.room.name].numberOfUpgraders++;
            }
        } 

    }

    Spawn.prototype.generateCreep =
    function (role, energy, targetRoom=this.room.name, body) {

        var directions = [TOP_RIGHT, TOP_LEFT, TOP, RIGHT, LEFT];

        if (!body) {

            switch (role) {
                case 'defender':
                    var body = createBody([ATTACK, MOVE, ATTACK, MOVE, CARRY, WORK, MOVE, ATTACK, MOVE, ATTACK, ATTACK], energy);
                    break;
                case 'claimer':
                    if (Memory.myRooms.length < Game.gcl) {
                        var body = createBody([MOVE, CLAIM, WORK, CARRY, WORK, CARRY, WORK, CARRY, WORK, CARRY], energy);
                    }
                    else {
                        var body = createBody([MOVE, CLAIM, CLAIM], energy);
                    }
                    break;
                case 'logistic':
                    var body = createBody([CARRY, WORK, CARRY, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], energy);
                    directions = [BOTTOM];
                    break;
                case 'miner':
                    var body = createBody([MOVE, WORK, WORK, WORK, WORK, WORK, MOVE, CARRY, WORK, CARRY], energy);
                    break;
                case 'scout':
                    var body = createBody([MOVE, MOVE], energy);
                    break;
                case 'transporter':
                    var body = createBody([MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, CARRY, CARRY, CARRY, MOVE], energy);
                    break;
                default:
                    var body = createBody([WORK, CARRY, MOVE, WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY,  WORK, MOVE, CARRY], energy);
            }

        }

        return this.spawnCreep(body, getCreepName(role, body), {
                memory: {
                    role: role,
                    home: this.room.name,
                    targetRoom: targetRoom
                },
                directions: directions
            })


    }




    function createBody(priorities, energy) {

        BODYPART_COST = {
            "move": 50,
            "work": 100,
            "attack": 80,
            "carry": 50,
            "heal": 250,
            "ranged_attack": 150,
            "tough": 10,
            "claim": 600
        }
    
        var body = [];
        var cumulativeCost = 0;
    
        for (let i = 0; i < priorities.length; i++) {
            if (cumulativeCost + BODYPART_COST[priorities[i]] <= energy) {
                body.push(priorities[i]);
                cumulativeCost += BODYPART_COST[priorities[i]];
            }
        }
        return body;
    
    }

    function getCreepName(role, body) {
        let firstLetter = role[0].toUpperCase();

        const firstNames = ["Adaranth","Adrienne","Agnes","Alabaster","Alder","Alex","Almedha","Amada","Amarant","Amaranth","Amelia","Ameria","Angeline","Annallee","Arc","Arch","Aries","Arlin","Armenia","Arora","Asema","Ash","Ashen","Ashera","Ashes","Aswang","Athena","Aura","Autumn","Avanth","Axel","Ayda","Beatrix","Belinda","Belladonna","Belle","Blade","Blight","Brie","Brink","Bruxa","Bryce","Caeda","Calamity","Carmilla","Carmin","Carmina","Carmine","Cassara","Cat","Cellica","Chalice","Chein","Cherry","Churel","Cinder","Clarita","Cloven","Crimson","Crowley","Cyan","Damsel","Davon","Dementia","Demonia","Diadora","Diamanda","Dominique","Drace","Draven","Dream","Ebony","Echo","Ecthrois","Elaine","Eldia","Eldon","Eldritch","Eleanore","Elegia","Elenor","Elissa","Ellena","Elliot","Elphina","Elza","Emilia","Emily","Emma","Emmit","Enigma","Entropy","Eoin","Essence","Estella","Eternity","Ethel","Eusmil","Everit","Fane","Fark","Fatima","Finch","Floris","Freed","Frita","Gabriel","Gail","Garnet","Gem","Genevere","Glimmer","Gloom","Gnash","Gossamer","Granger","Griffin","Grim","Grimina","Gwin","Habitha","Haera","Harley","Harlot","Hazelmere","Hebkya","Hegna","Herma","Hortensia","Ike","Ilene","Ilta","Imeena","Imperia","Inigo","Iona","Ivory","Jayde","Jezebel","Jillia","Jinx","Jocelyn","Jude","Julienne","Juniper","Kaige","Kali","Kallee","Kandyl","Karlene","Karmin","Katia","Katreena","Kellam","Kenia","Kindle","Klyn","Lace","Laguna","Lament","Larc","Larsa","Lauden","Law","Layre","Leeta","Leona","Leora","Lexx","Lilith","Lillith","Link","Lirit","Lithia","Lorelei","Loren","Luce","Lucia","Lucretia","Lulu","Luna","Lusha","Lycia","Lyndis","Lyra","Mace","Maggard","Maggart","Magwina","Maleficent","Marcia","Margorie","Marth","Max","Maxine","Mayze","Memory","Mercy","Mirage","Misericordia","Mist","Mizette","Moon","Moonlight","Morden","Morrin","Morrow","Morticia","Mystery","Narween","Nash","Nebula","Neira","Nereza","Nifsara","Noirax","Noire","Norrix","Nylora","Obsidian","Oma","Omen","Opal","Ophelia","Pamela","Pandora","Pearl","Persephone","Porcelain","Princessa","Prysm","Quintessa","Quistis","Quota","Qutie","Rain","Ramona","Rapture","Raura","Rave","Raven","Requiem","Ridley","Riley","Rogue","Rosary","Roshia","Rubia","Sable","Sabre","Salem","Samantha","Sana","Sarah","Satin","Savina","Sax","Scarlet","Scarlett","Secret","Selena","Senka","Seraphim","Seren","Servillah","Seskel","Severa","Severina","Shadow","Shayde","Siouxsie","Sisuca","Soren","Stone","Storm","Strawberri","Sully","Suspiria","Sybil","Tabitha","Talon","Theda","Thessalia","Thistle","Thorne","Thyme","Trik","Twilight","Ukara","Ulsa","Umbri","Umona","Upiorzyca","Ursula","Vail","Valaine","Vayne","Velorina","Velvet","Veronika","Vervain","Vesh","Vexacion","Vexx","Viessa","Viktoria","Violet","Voss","Weiss","Wendell","Whisper","Willow","Winona","Wish","Wysteria","Xenia","Xoxo","Xyla","Yao","Yellow","Ymo","Yoko","Yureka","Zada","Zaine","Zane","Zaphara","Zayne","Zeldalia","Zell","Zen","Zephyr","Zero","Zillah","Zima","Zofia","Zola","Zolona","Zunda", "Adaranth","Alabaster","Alder","Alex","Amada","Amarant","Amaranth","Arc","Arch","Aries","Arlin","Asema","Ash","Ashen","Ashes","Aura","Avanth","Axel","Blade","Blight","Brink","Bryce","Carmin","Carmine","Chalice","Cinder","Cloven","Crimson","Crowley","Cyan","Dominique","Drace","Draven","Dream","Echo","Ecthrois","Eldon","Eldritch","Elliot","Emmit","Enigma","Eoin","Ethel","Everit","Fane","Fark","Finch","Freed","Gabriel","Gail","Gloom","Gnash","Granger","Griffin","Grim","Hazelmere","Ike","Inigo","Jayde","Jinx","Jude","Kaige","Kellam","Kindle","Klyn","Laguna","Larc","Larsa","Lauden","Law","Layre","Lexx","Link","Mace","Maggard","Maggart","Marth","Max","Mist","Moon","Morden","Morrow","Nash","Nebula","Noire","Norrix","Obsidian","Omen","Pandora","Prysm","Rain","Rave","Raven","Requiem","Ridley","Rogue","Sable","Sabre","Salem","Sax","Seren","Seskel","Shadow","Shayde","Soren","Stone","Storm","Sully","Talon","Thorne","Thyme","Trik","Umbri","Vail","Vayne","Vesh","Vexacion","Vexx","Voss","Weiss","Wendell","Yao","Ymo","Zaine","Zane","Zayne","Zell","Zen","Zephyr","Zero"];
        const surnames = ["Abraham","Acheron","Adam","Adaranth","Adoranz","Alabaster","Alder","Alex","Alistair","Amada","Amarant","Amaranth","Anthrax","Antone","Arc","Arch","Archer","Argent","Aries","Ark","Arlin","Artemis","Arthur","Asema","Ash","Ashen","Ashes","Ashton","Aura","Auron","Autar","Avanth","Axel","Balo","Balsam","Balthier","Bane","Bartholomew","Bartram","Belzebob","Blade","Blight","Bludwan","Brink","Bryce","Butler","Caecilius","Caesar","Camus","Carmin","Carmine","Chadli","Chalice","Chandler","Chaol","Chaos","Charles","Chrom","Cidolfus","Cinder","Cloven","Colton","Crimson","Crisenth","Crowley","Cyan","Cyran","Damien","Damon","Dante","Dario","Darren","Darth","Davon","Demien","Desmond","Devdan","Dexter","Dhampir","Dominic","Dominique","Dommik","Drace","Drachen","Draegan","Drake","Drakkar","Draven","Dream","Dred","Dreven","Driscoll","Duke","Duradel","Echo","Ecthrois","Edge","Eike","Eldon","Eldritch","Elliot","Emmit","Enigma","Eoin","Ephraim","Ethel","Eukithor","Eulisses","Everit","Fane","Fark","Finch","Firion","Forrest","Franz","Frederik","Freed","Fromir","Gabranth","Gabriel","Gail","Galexialyn","Gastly","Gattas","Glacier","Gloom","Gnash","Godfrey","Gossom","Gotham","Grail","Granger","Granite","Grendel","Griffin","Grim","Grissom","Grumio","Hades","Hamlet","Hanzel","Hazelmere","Heinrik","Heskel","Hitch","Hogan","Holmes","Holstein","Hunter","Icas","Ike","Iluz","Incubus","Inigo","Irvine","Isaac","Isaiah","Jacques","Jasper","Jayde","Jayden","Jaymes","Jeronimo","Jett","Jinx","Joshua","Jude","Kaige","Kaiser","Kapral","Karayan","Karn","Karver","Keetes","Kellam","Kieran","Kindle","Kirnon","Klark","Klaus","Klyn","Kragen","Labyrinth","Laguna","Landis","Larc","Larsa","Lauden","Law","Layre","Lazarus","Lennix","Leviathan","Lexx","Lincoln","Link","Loki","Loom","Lore","Louis","Lucifer","Lucius","Luke","Luther","Lux","Lynk","Lynx","Mace","Maggard","Maggart","Marth","Mathian","Max","Maxim","Mazus","Mist","Mitch","Mitrik","Moldark","Moon","Morden","Morren","Morrow","Mortas","Nadir","Nash","Nayte","Nealuchi","Nebula","Neclord","Nicholai","Nicolas","Nictis","Nightshade","Noire","Norman","Norrix","Obsidian","Oklarth","Omar","Omen","Orfeo","Otto","Pandora","Panther","Parch","Parrish","Payne","Peregrine","Petrik","Prince","Pritchard","Prysm","Puck","Quint","Quintus","Quway","Quye","Ragnor","Rain","Rakshasas","Ramin","Rassler","Rave","Raven","Redcap","Reks","Requiem","Rexx","Reyson","Rhazien","Rhys","Richard","Richmond","Ridley","Riskel","Rogue","Romulus","Ross","Rumlar","Sable","Sabre","Salem","Salvodor","Salvodore","Salvotor","Salvotore","Samuel","Satan","Savant","Sax","Sceledrus","Scias","Seifer","Semias","Sephiran","Sepitus","Seren","Seskel","Seth","Seymour","Shadow","Shayde","Sherlock","Sid","Sisk","Sliske","Smoky","Soran","Soren","Steele","Stone","Storm","Stryker","Sully","Synth","Tack","Talon","Tempest","Theodor","Theodore","Theodoric","Thor","Thorne","Thunder","Thyme","Tidus","Treznor","Trik","Tristan","Trixter","Uberto","Ulrik","Umbri","Upir","Vail","Valhalla","Vance","Vaughn","Vayne","Venkalth","Vesh","Vexacion","Vexx","Victor","Viktor","Virion","Viscardi","Vome","Vorkalth","Voss","Vossler","Weiss","Wendell","Wendrake","Winmore","Wolf","Wright","Xander","Xensor","Xix","Yao","Yizla","Ymo","Yulis","Zadicus","Zadimus","Zaff","Zain","Zaine","Zamza","Zander","Zane","Zaros","Zayin","Zayn","Zayne","Zeddicus","Zegrath","Zeidan","Zeke","Zelgius","Zell","Zelroth","Zen","Zeph","Zephyr","Zero","Zindo","Zorander","Zul","Zyler","Kobe","Barkridge","Skinner","Serphent","Caligari","Bloodworth","Vonner","Morelli","Sharpe","Sangrey","Lobo","Norwood","Christanti","Mock","Le Torneau","Murik","Le Doux","La Croix","Drach","Orlando","Krauss","Vossen","Vandran","Drabek","Cross","Von Stein","Lobo","Shade","Crane","Bloodgood","Roseberg","Le Blank","Borges","Morgan","Delacroix","Cane","Church","Villalobos","Vigil","Lestat","Dupree","Maganti","Devonshire","Le Rouge","Victor","Delarosa","Breedlove","Moriarty","Ash","Talbot","Creighton","Christian","Barlow","Carpathia","Addington","Aimes","Angelsin","Argent","Aura","Autumn","Barclay","Black","Blackwood","Blankley","Brack","Brevil","Calarook","Chainsaw","Chalice","Cloven","Craft","Crane","Crimson","Cromwell","Crowe","Crypt","Darkmore","Deamonne","Denholm","Depraysie","Diablo","Diablos","Digby","Dread","Dred","Duke","Dukes","Ebonywood","Everbleed","Evilian","Fade","Fadington","Fang","Frost","Geulimja","Gnash","Graeme","Grail","Graves","Grim","Grimm","Grimsbane","Grove","Hallewell","Hart","Helion","Heliot","Highmore","Hook","Howler","Hunt","Interfector","Jinx","Jones","Kane","Keeling","Killian","Killoran","Knotley","Labyrinth","Latimer","Lovelace","Lynx","Magnus","Maleficum","Mallor","Malum","Manglyeong","Marth","Monroe","Moonfall","Morgan","Mortem","Natas","Naxxremis","Nox","Onyx","Panther","Payne","Periculum","Pickerin","Quinn","Rathmore","Razor","Redwood","Rex","Riddle","Ripper","Sanguine","Scarletwound","Sephiran","Shackleton","Shade","Shadowend","Shadowmend","Shadowsoul","Shadowwalker","Snow","Soulton","Steros","Stone","Storm","Strain","Tempest","Tenebris","Thornheart","Thornton","Tombend","Trevil","Trevils","Umbra","Vexx","Vixen","Void","Whisper","White","Whitmore","Willow","Winter","Wolf","Wolfmoon","Wood","Woods","Wraith","Wright","Wyrm","Zayne","Zorander","Zul"];
        

        if (body.length < 10) {
            var titleVocative = ["Administrator","Assistant","Baron","Captain","Chairman","Chief","Consul","Curator","Delegate","Director","Earl","Exarch","Governor","Head","Headman","Lady","Liaison","Lord","Master","Matriarch","Minister","Noble","Official","Overlord","Patriarch","Prime","Professor","Secretary","Sir","Tribune"];
        }
        else if (body.length < 30) {
            var titleVocative = ["Queen","Matriarch","Mother","Father","Admiral","Baron","Blessed","Caesar","Captain","Cardinal","Chairman","Chief","Chieftain","Commander","Corporal","Count","Defender","Divine","Dom","Duke","Earl","Elder","Eminence","Emperor","Exarch","General","Governor","Grand Master","Guardian","Headman","Herald","Imperator","King","Lord","Master","Palatine","Paragon","Patriarch","Pharaoh","President","Prime","Prince","Protector","Ruler","Shogun","Sultan"];
        }
        else {
            var titleVocative = ["Queen","Matriarch","Mother","Father","Admiral","Baron","Blessed","Caesar","Captain","Cardinal","Chairman","Chief","Chieftain","Commander","Corporal","Count","Defender","Divine","Dom","Duke","Earl","Elder","Eminence","Emperor","Exarch","General","Governor","Grand Master","Guardian","Headman","Herald","Imperator","King","Lord","Master","Palatine","Paragon","Patriarch","Pharaoh","President","Prime","Prince","Protector","Ruler","Shogun","Sultan"];
        }

        const titleAdjunct = ["Arrows","Ash","Blue","Bones","Conviction","Damned","Darkness","Dawn","Death","Demons","Dragons","Dreams","Dusk","Dwarves","Elves","Faith","Fear","Fire","Fools","Fortitude","Gold","Green","Heaven","Hell","Ice","Iron","Justice","Kingdoms","Life","Light","Men","Nations","Nature","New Kingdom","Night","Nightmares","the Old Kingdom","Orcs","Order","Peace","Purity","Realms","Red","Sand","Ships","Silver","Skulls","Snow","Steel","Swords","Thieves","Unity","Universe","Virtue","War","Watch","Water","the Dead","the Desert","the Dominion","the Earth","the East","the Fields","the Fleet","the Forests","the Future","the Gods","the Lakes","the Lands","the Living","the Marsh","the Millenium","the Moon","the Mountains","the New Age","the North","the Ocean","the People","the Plains","the Reach","the Realm","the Rivers","the Seas","the Skies","the Small","the South","the Stars","the Sun","the Titans","the Undead","the Vale","the Valleys","the West","the Wild","the Winds","the Wise","the World", "Birth","Bliss","Blood","Bones","Darkness","Death","Devotion","Divinity","Dreams","Eternity","Faith","Freedom","Genesis","Gold","Gracy","Healing","Life","Light","Mercy","Misery","Nature","Nightmares","Peace","Pestinence","Piety","Pure Hearts","Purity","Rebirth","Sanctity","Shadow","Silence","Silver","Solitude","Spirits","Time","Virtue","Worship","the Arcane","the Blue","the Dead","the Earth","the East","the Flame","the Gardens","the King","the Light","the Living","the Moon","the Night","the North","the Phoenix","the Realm","the Red","the Sands","the Sea","the South","the Stars","the Sun","the Undead","the Undying","the Veil","the Voice","the Void","the West","the White","the World"];


        let creepLastNames = _.filter(surnames, (n) => n[0] == firstLetter);

        let creepName = firstNames[Game.time % firstNames.length] + ' ' + 
                        creepLastNames[Game.time % creepLastNames.length] + ',\n' + 
                        titleVocative[Game.time % titleVocative.length] + ' of ' + 
                        titleAdjunct[Game.time % titleAdjunct.length];

        return creepName;
    }