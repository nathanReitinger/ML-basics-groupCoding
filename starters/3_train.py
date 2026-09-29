## Assignment 3 - ML
##
## Keras needs TensorFlow, which cannot run in a browser tab. The lab
## provides a stand-in with the same names, so these two lines are the
## same ones you would write in Colab. Everything below is real Keras.

from keras.models import Sequential
from keras.layers import Dense
import numpy as np


'''function used to give correct output'''
training_data = np.array([[0,0],[0,1],[1,0],[1,1]], "float32")## input to test on and learn from
target_data =   np.array([[0]  ,[0]  ,[0]  ,[1]], "float32")  ## the ground truth
EPOCHS_TO_TRAIN_ON = 500                                      ## how many iterations to guess-and-check
model = Sequential()                                          ## type of model
model.add(Dense(16, input_dim=2, activation='relu'))          ## first layer of network
model.add(Dense(1, activation='sigmoid'))                     ## second layer of network
model.compile(loss='mean_squared_error',                      ## how to decide what 'error' means
              optimizer='adam',                               ## relates to gradient descent
              metrics=['accuracy'])                           ## how to report 'correctness'
history = model.fit(training_data, target_data, epochs=EPOCHS_TO_TRAIN_ON)
scores = model.evaluate(training_data, target_data)
print("\n%s: %.2f%%" % (model.metrics_names[1], scores[1]*100))

## let's check that the model is giving the correct result

print("input (0,0) gives output:", (model.predict(np.array([[0,0]], "float32")).round()))
print("input (0,1) gives output:", (model.predict(np.array([[0,1]], "float32")).round()))
print("input (1,0) gives output:", (model.predict(np.array([[1,0]], "float32")).round()))
print("input (1,1) gives output:", (model.predict(np.array([[1,1]], "float32")).round()))


## =====================================================================
##
##  WHAT YOU JUST RAN
##
##  Nobody chose the numbers. You handed it four examples and it worked
##  out 65 of them on its own, by guessing and checking 500 times.
##
##  Read the comments beside each line above. Every one of them is a
##  real idea:
##
##      Sequential()        the kind of model - layers, one after another
##      Dense(16, ...)      a layer of 16 neurons, each one exactly the
##                          machine you built by hand in assignment 2
##      Dense(1, ...)       the last layer, boiling it down to one answer
##      compile(...)        what counts as 'wrong', and how to fix it
##      fit(...)            the actual guessing and checking
##      evaluate(...)       how did it do
##
##
##  NOW TRY XOR
##
##  target_data above is an AND gate: 1 only when both inputs are 1.
##  A single neuron can do AND - you could do this one by hand.
##
##  Change that one line to
##
##      target_data =   np.array([[0]  ,[1]  ,[1]  ,[0]], "float32")
##
##  and you have XOR: the output is 1 when the inputs are DIFFERENT.
##
##  Before you run it, go back to assignment 2 and hunt for three
##  numbers that do XOR. There are none. No bias and no pair of weights
##  can ever do it.
##
##  Then run this again. Same code, same 500 epochs, and it finds XOR
##  anyway - because 16 neurons in the middle give it somewhere to work
##  that a single neuron never had.
##
## =====================================================================
