from flask import Flask, render_template, request, redirect, url_for,session
import random
import requests

app = Flask(__name__)

@app.route('/start', methods=['GET', 'POST'])
@app.route('/', methods=['GET', 'POST'])
def start():
    if "submit" in request.form:
        name = request.form["name"]
        if "/" in name:
            name = name.replace("/", "")
        elif "<tagpass>" in name:
            return redirect(url_for('indexx', name=name))
        return redirect(url_for('index', name=name))
    return render_template('start.html')


@app.route('/random/', methods=['GET', 'POST'])
@app.route('/random/<name>', methods=['GET', 'POST'])
def index(name=None, numb=None, numhis=[], numhiss=[]):
    if "nump" in request.form:
        numb = random.randint(1, 100)
        numhis.append(numb)
    elif "numh" in request.form:
        numhiss = str(numhis)[1:-1]
    return render_template('welcome.html', name=name, numb=numb, numhiss=numhiss)


@app.route('/randon/', methods=['GET', 'POST'])
@app.route('/randon/<name>', methods=['GET', 'POST'])
def indexx(name=None, numb=None, numhis=[], numhiss=[]):
    if "nump" in request.form:
        numb = random.randint(1, 100)
        numhis.append(numb)
        if numb <= 86:
            global info
            info = "pass86"
            return redirect(url_for('admin'))
    elif "numh" in request.form:
        numhiss = str(numhis)[1:-1]
    return render_template('welcome.html', name=name, numb=numb, numhiss=numhiss)


@app.route('/admin', methods=['GET', 'POST'])
def admin(adminpass=None, wordleans=None):
    if "wordle" in request.form:
        url = "https://wordle-answers-solutions.p.rapidapi.com/today"

        headers = {
            "X-RapidAPI-Key": "46be2e365emshb1b0877aae1d997p1227bajsn5e68aee4be92",
            "X-RapidAPI-Host": "wordle-answers-solutions.p.rapidapi.com"
        }

        response = requests.get(url, headers=headers)
        wordleans = response.json()
        adminpass = 'good'
    try:
        info
    except NameError:
        return redirect(url_for('start'))
    else:
        pass
    if "submit" in request.form:
        passw = request.form["passw"]
        if "pass86" in passw:
            adminpass = 'good'
        else:
            exit('Bad admin login')
    return render_template('admin.html', adminpass=adminpass, wordleans=wordleans)


if __name__ == '__main__':
    app.run(debug=True)
