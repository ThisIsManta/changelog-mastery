#!/usr/bin/env node

const fs = require('fs')
const fp = require('path')
const ps = require('process')
const cp = require('child_process')
const _ = require('lodash')

const currentVersion = require(fp.join(ps.cwd(), 'package.json')).version
const recentVersion = _.chain(cp.execSync(`git --no-pager tag --sort=version:refname`, { encoding: 'utf-8' }).split('\n'))
	.filter(line => /^v\d+\.\d+\.\d+$/.test(line))
	.last()
	.defaultTo('v')
	.value()
	.substring(1)

const commitQuery = recentVersion ? `v${recentVersion}...master` : ''
const commitMessages = _.chain(cp.execSync(`git --no-pager log --pretty=format:%s ${commitQuery}`, { encoding: 'utf-8' }).trim().split('\n'))
	.reverse()
	.sortBy(
		message => /^Add /.test(message) ? 0 : 1,
		message => /^Fix /.test(message) ? 0 : 1,
	)
	.map(message => '- ' + message + '.')
	.value()
	.join('\n')

const today = new Date()
const filePath = fp.join(ps.cwd(), 'CHANGELOG.md')

let fileText = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : ''
fileText = `## ${currentVersion} - ${today.getFullYear()}-${_.padStart(today.getMonth() + 1, 2, '0')}-${_.padStart(today.getDate(), 2, '0')}
${commitMessages}

` + fileText
fileText = fileText.trim()

if (ps.argv.includes('--dry-run')) {
	console.log(fileText)
	return
}

fs.writeFileSync(filePath, fileText, 'utf-8')

cp.execSync(`git add ./CHANGELOG.md`)
cp.execSync(`git commit --message "Update CHANGELOG.md"`)
