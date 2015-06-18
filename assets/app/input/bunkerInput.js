// Directive to handle outside influences on the input/chat box
// Currently handles 3 functions:
// 1. updating the text in the box when an event (inputText) is broadcast
// 2. informing the user service if the text changes, so it can broadcast typing to other connected users
// 3. updating the user when the window is blurred/focused
app.directive('bunkerInput', function ($rootScope, $window, bunkerData) {
	return {
		scope: {
			text: '=bunkerInput'
		},
		link: function (scope, elem) {

			// Change the text if commanded to do so
			scope.$on('inputText', function (evt, text) {
				var append = scope.text.length ? ' ' : ''; // start with a space if message already started
				append += text + ' ';
				scope.text += append;
				angular.element(elem).focus();
			});

			// Broadcast typing when the text changes
			scope.$watch('text', function (value, oldValue) {
				if (!value || !oldValue || value == oldValue) return;
				bunkerData.broadcastTyping($rootScope.roomId);
			});
		}
	};
});
