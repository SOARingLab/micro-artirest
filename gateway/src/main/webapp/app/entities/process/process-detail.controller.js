(function() {
    'use strict';

    angular
        .module('gatewayApp')
        .controller('ProcessDetailController', ProcessDetailController);

    ProcessDetailController.$inject = ['$scope', '$rootScope', '$stateParams', '$http', 'previousState', 'entity', 'Process'];

    function ProcessDetailController($scope, $rootScope, $stateParams, $http, previousState, entity, Process) {
        $scope.process = entity;
        $scope.previousState = previousState.name;
        $scope.availableServices = [];
        $scope.processModelId = {};
        $scope.artifactIds = [];
        $scope.artifactModelIds = [];
        $scope.artifacts= [];
        $scope.artifactModels = [];
        $scope.currentArtifactForService = {};
        $scope.logs = [];

        var unsubscribe = $rootScope.$on('gatewayApp:processUpdate', function(event, result) {
            $scope.process = result;
        });
        $scope.$on('$destroy', unsubscribe);

        $scope.load = function (id) {
            Process.get({id: id}, function(result) {
                $scope.process = result;
                $scope.artifactIds = $scope.process.artifactIds;
                for(var i=0; i<$scope.artifactIds.length; i++){
                    $http.get('processes/api/artifacts/'+$scope.artifactIds[i]).then(function(resArtifacts){
                        $scope.artifacts.push(resArtifacts.data);
                        return $scope.artifacts;
                    });
                }

                $scope.processModelId = $scope.process.processModelId;
                $http.get('artifactmodel/api/process-models/' + $scope.process.processModelId).then(function(resProcessModel){
                    $scope.artifactModelIds = resProcessModel.data.artifactModelIds;

                    for(var i=0; i<$scope.artifactModelIds.length; i++){
                        $http.get('artifactmodel/api/artifact-models/'+$scope.artifactModelIds[i]).then(function(resArtifactModels){
                            $scope.artifactModels.push(resArtifactModels.data);
                        });
                    }
                    return $scope.artifactModels;
                });
                $scope.loadAvailableServices();
                $scope.loadLogs();
            });
        };

        $scope.load($stateParams.id);

        $scope.refresh = function(){
            $scope.load($stateParams.id);
        };

        $scope.loadAvailableServices = function(){
            $http.get('service/api/processes/'+$stateParams.id+'/available_services')
                .then(function(res){
                    $scope.availableServices = res.data;
                },function(res){
                    // error
                });
        };

        $scope.loadLogs = function(){
            $http.get('processes/api/processes/'+$stateParams.id+'/processLogs')
                .then(function(res){
                    $scope.logs = res.data;
                    for (var i = 0; i < $scope.artifacts.length; i++) {
                        var artifact = $scope.artifacts[i];

                        $scope.showArtifactLifeCycle(artifact, $scope.logs);
                    }
                    return $scope.logs;
                }, function(res){
                    alert('Failed to load process logs');
                });
        };

        var findProcessArtifact = function(name){
            for(var i=0;i<$scope.artifacts.length;i++){
                var artifact = $scope.artifacts[i];

                if (artifact.name === name){
                    return artifact;
                }
            }

            return undefined;
        };

        var initArtifact = function(name){
            var artifactModel;
            for (var i=0;i<$scope.artifactModels.length;i++){
                var model = $scope.artifactModels[i];
                if (model.name === name){
                    artifactModel = model;
                    break;
                }
            }

            var artifact = {
                name: name,
                attributes: []
            };

            if(artifactModel !== undefined){

                for (var i = 0; i < artifactModel.attributes.length; i++){
                    var attr = artifactModel.attributes[i];
                    artifact.attributes.push({
                        name: attr.name,
                        comment: attr.comment,
                        value: ''
                    });
                }
            }

            return artifact;
        };

        $scope.isServiceParam = function(service, attribute_name){
            return service.inputParams.indexOf(attribute_name) >= 0;
        };

        $scope.showService = function(service){
            $scope.currentService = service;

            var artifact = findProcessArtifact(service.inputArtifact);

            if (artifact !== undefined){
                $scope.currentArtifactForService = artifact;
            } else {
                $scope.currentArtifactForService = initArtifact(service.inputArtifact);
            }


        };

        $scope.invokeService = function(service){
            var url = 'processes/api/processes/'+$stateParams.id+'/services/'+service.name;
            console.log($scope.currentArtifactForService);

            $http.post(url, $scope.currentArtifactForService)
                .then(function(res){
                    console.log(res);

                    $scope.refresh();
                    $scope.currentService = undefined;
                    $scope.currentArtifactForService = undefined;
                }, function(res){
                    // error
                    alert('Failed to invoke service ' + service.name);
                });
        };


        // ------------------------------

        $scope.findStateComment = function(artifactInstance, stateName){
            var states = [];
            for (var i = 0; i < $scope.artifactModels.length; i++) {
                var artifact = $scope.artifactModels[i];
                if (artifact.name === artifactInstance.name) {
                    states = artifact.states;
                    break;
                }
            }

            // console.log(states);

            for (var i = 0; i < states.length; i++) {
                if(states[i].name === stateName){
                    return states[i].name;
                }
            }

            return stateName;
        };

        $scope.findStateModel = function(artifactInstance, stateName){
            var state = undefined;

            var states = [];
            for (var i = 0; i < $scope.artifactModels.length; i++) {
                var artifact = $scope.artifactModels[i];
                if (artifact.name === artifactInstance.name) {
                    states = artifact.states;
                    break;
                }
            }

            // console.log(states);

            for (var i = 0; i < states.length; i++) {
                if(states[i].name === stateName){
                    return states[i];
                }
            }

            return state;
        };

        $scope.showArtifactLifeCycle = function(artifact, logs){
            var transitions = [];
            for (var i = 0; i < logs.length; i++) {
                if(logs[i].artifactId === artifact.id && logs[i].type === "STATE_TRANSITION"){
                    transitions.push({
                        from: logs[i].fromState,
                        to: logs[i].toState,
                    });
                }
            }

            var nodes = [];
            var edges = [];
            var key = 0;
            var x = 0, y = 0;
            var curState;
            var curNode;

            var alignmentRight = transitions.length <= 3;

            if (transitions.length === 0) {
                var startNode = {
                    key: key++,
                    //text: $scope.findStateComment(artifact, "Start"),
                    text: 'Start',
                    loc: "" + x+ " " + y,
                    category: 'Start'
                };

                nodes.push(startNode);
            };

            for (var i = 0; i < transitions.length; i++) {
                var transition = transitions[i];
                if (transition.from === "Start") {
                    var startNode = {
                        key: key++,
                        //text: $scope.findStateComment(artifact, transition.from),
                        text: transition.from,
                        loc: "" + x+ " " + y,
                        category: 'Start'
                    };
                    var secondNode = {
                        key: key++,
                        //text: $scope.findStateComment(artifact, transition.to),
                        text: transition.to,
                        loc: "" + (x+120) + " "+ y
                    };

                    x = x + 120;

                    // if (!alignmentRight) {
                    //   x = x - 120;
                    //   y = y + 80;
                    //   secondNode.loc = "" + x + " " + y;
                    // };

                    nodes.push(startNode);
                    nodes.push(secondNode);
                    edges.push({
                        from: startNode.key,
                        to: secondNode.key,
                        fromPort: 'R',
                        toPort: 'L'
                    });
                    curState = transition.to;
                    curNode = secondNode;

                    break;
                }
            }

            var maxWidth = $('.artifact-instance').width();

            while(true){
                var transition = undefined;
                for (var i = 0; i < transitions.length; i++) {

                    if(transitions[i].from === curState){

                        var stateModel = $scope.findStateModel(artifact, transitions[i].to);
                        transition = transitions[i];
                        var node = {
                            key: key++,
                            text: stateModel.name,
                            loc: "" + (x+120)+ " "+y
                        };

                        if (stateModel.type === "FINAL") {
                            node["category"] = "End";
                        }

                        x = x + 120;

                        // if (!alignmentRight) {
                        //   x = x - 120;
                        //   y = y + 80;
                        //   node.loc = "" + x + " " + y;
                        // };

                        var nextLine = false;
                        if (x >= maxWidth - 80) {
                            x = 0;
                            y = y + 100;
                            node.loc = "" + x + " " + y;
                            nextLine = true;
                        }


                        nodes.push(node);
                        edges.push({
                            from: curNode.key,
                            to: node.key,
                            fromPort: !nextLine ? 'R' : 'B',
                            toPort: !nextLine ? 'L' : 'T'
                        });

                        curNode = node;
                        curState = transitions[i].to;
                    }

                }

                if (transition === undefined) {
                    break;
                }
            }

            var json = {
                "class": "go.GraphLinksModel",
                "linkFromPortIdProperty": "fromPort",
                "linkToPortIdProperty": "toPort",
                "nodeDataArray": nodes,
                "linkDataArray": edges
            };

            console.log(json);

            if (json.nodeDataArray.length > 8) {
                $("#myDiagram-"+artifact.id).css("height", "400px")
            }

            initFlowchart("myDiagram-"+artifact.id);
            loadFlowchartFromJson("myDiagram-"+artifact.id, json);
        };
    }
})();
