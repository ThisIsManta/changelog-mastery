#!/usr/bin/env node

const fs = require('fs')
const fp = require('path')
const ps = require('process')
const cp = require('child_process')
const _ = require('lodash')
const linkify = require('linkify-it')()

async function main() {
	const packageJson = require(fp.join(ps.cwd(), 'package.json'))

	const repositoryLink = _.get(_.get(packageJson, 'repository.url', packageJson.repository || '').match(/^git\+(https?:\/\/.+?)\.git$/), 1)
	const isRepositoryLink = text => {
		const matcher = new RegExp('^' + _.escapeRegExp(repositoryLink))
		return text.match(matcher)
	}

	const recentVersion = _.chain(await git('tag', '--sort=version:refname'))
		.split('\n')
		.filter(line => /^v\d+\.\d+\.\d+$/.test(line))
		.last()
		.defaultTo('v')
		.value()
		.substring(1)

	const defaultBranch = await git('rev-parse', 'origin/HEAD')
	const commitQuery = recentVersion ? `v${recentVersion}...${defaultBranch}` : ''
	const commitMessages = _.chain(await git('log', '--format="%H%n%D%n%f%n%s"', commitQuery))
		.split('\n')
		.chunk(4)
		.compact()
		.reverse()
		.map(([hash, refs, message, longMessage]) => ({
			hash,
			version: _.trimStart(refs.split(', ').find(ref => ref.startsWith('tag: v')), 'tag: v') || undefined,
			message,
			links: (linkify.match(longMessage) || []).filter(isRepositoryLink),
		}))
		.reject(({ message }) => /^Merge [\w-]+ branch /.test(message))
		.sortBy(
			({ message }) => /^Add(ed)? /.test(message) ? 0 : 1,
			({ message }) => /^Fix(ed)? /.test(message) ? 0 : 1,
			({ message }) => message,
		)
		.map(({ message, links }) => '- ' + _.trim(_.trimEnd(message, '.')) + shortenLinks(links) + '.')
		.value()
		.join('\n')

	const today = new Date()
	const stamp = today.getFullYear() + '-' +
		_.padStart(today.getMonth() + 1, 2, '0') + '-' +
		_.padStart(today.getDate(), 2, '0')

	const filePath = fp.join(ps.cwd(), 'CHANGELOG.md')
	let fileText = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : ''
	fileText = _.trim(`### ${packageJson.version} - ${stamp}\n${commitMessages}\n\n` + fileText)

	if (ps.argv.includes('--dry-run')) {
		console.log(fileText)
		return
	}

	fs.writeFileSync(filePath, fileText, 'utf-8')

	await git('add', './CHANGELOG.md')
	await git('commit', '--message', 'Update CHANGELOG.md')
}
main()

function git(...formalParameters) {
	return new Promise((resolve, reject) => {
		const actualParameters = ['--no-pager', ...formalParameters]

		const pipe = cp.spawn('git', actualParameters)

		let outputBuffer = ''

		pipe.stdout.on('data', (text) => {
			outputBuffer += String(text)
		})

		pipe.stderr.on('data', (text) => {
			outputBuffer += String(text)
		})

		pipe.on('close', (exit) => {
			if (exit === 0 || exit === null) {
				resolve(outputBuffer.trim())
			} else {
				reject(outputBuffer.trim())
			}
		})
	})
}

function shortenLinks(links) {
	if (_.isEmpty(links)) {
		return ''
	}

	return ' (' + links.join(', ') + ')'
}
