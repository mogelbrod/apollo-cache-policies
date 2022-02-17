import gql from "graphql-tag"
import React from "react"
import {
  ApolloClient,
  ApolloProvider,
  HttpLink,
  useApolloClient,
  useQuery
} from "@apollo/client"
import { relayStylePagination } from "./relayPagination"; //"@apollo/client/utilities"
import { InvalidationPolicyCache } from "../../dist"
import {
  BrowserRouter,
  Route,
  Routes,
  Link,
  useParams,
  useNavigate
} from "react-router-dom"
import { CachePersistor, LocalStorageWrapper } from "apollo3-cache-persist"

const cache = new InvalidationPolicyCache({
  dataIdFromObject({ __typename, id }) {
    return id
  },
  typePolicies: {
    Query: {
      fields: {
        /*
         Items have a globally unique id, so we're using `id` instead of
         `{__typename, id}` to resolve entities.
         */
        film(existing, { args, toReference }) {
          return existing || toReference({ id: args.id })
        },
        // Returns a relay-style paginated list of items
        allFilms: relayStylePagination(["first", "after"])
      }
    }
  },
  invalidationPolicies: {
    timeToLive: 10e3,
    renewalPolicy: "write-only"
  }
})

window.cache = cache

const cachePersistor = new CachePersistor({
  cache,
  storage: new LocalStorageWrapper(window.localStorage),
  debug: true,
})

cachePersistor.restore()

const client = new ApolloClient({
  cache,
  link: new HttpLink({
    uri: "https://swapi-graphql.netlify.app/.netlify/functions/index",
    credentials: "omit"
  })
})

export default function App() {
  return (
    <div className="App">
      <ApolloProvider client={client}>
        <button
          onClick={() => {
            cachePersistor.purge()
            .then(() => client.resetStore())
          }}
          children="Reset"
        />
        <BrowserRouter>
          <Routes>
            <Route index element={<List />} />
            <Route path=":id" element={<Film />} />
          </Routes>
        </BrowserRouter>
      </ApolloProvider>
    </div>
  )
}

const LIST_QUERY = gql`
  query List($first: Int, $after: String) {
    allFilms(first: $first, after: $after) {
      pageInfo {
        startCursor
        hasPreviousPage
        endCursor
        hasNextPage
      }
      edges {
        cursor
        node {
          id
          title
        }
      }
    }
  }
`

function List() {
  const [after, setAfter] = React.useState()
  const query = useQuery(LIST_QUERY, {
    variables: { first: 3, after },
    fetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: true,
    returnPartialData: true,
  })
  if (!query.data?.allFilms) {
    return <p>Loading list...</p>
  }
  return (
    <>
      <h2>All films</h2>
      <ul>
        {query.data.allFilms.edges.map(({ node }) => (
          <li key={node.id}>
            <Link to={node.id} children={node.title} />
          </li>
        ))}
      </ul>
      {query.data?.allFilms.pageInfo.hasNextPage && (
        <button
          onClick={() => {
            const after = query.data.allFilms.pageInfo.endCursor
            query
              .fetchMore({
                variables: { after }
              })
              .then(() => setAfter(after))
          }}
          children="load more"
        />
      )}
    </>
  )
}

const FILM_QUERY = gql`
  query Film($id: ID!) {
    film(id: $id) {
      id
      title
    }
  }
`

function Film() {
  const { id } = useParams()
  const navigate = useNavigate()
  const querySingle = useQuery(FILM_QUERY, {
    variables: { id },
    fetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: true,
    returnPartialData: true,
  })
  const queryList = useQuery(LIST_QUERY, {
    variables: { first: 10 },
    fetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: true,
    returnPartialData: true,
  })
  console.log(queryList.data?.allFilms.edges.map(x => x.node.title.substr(0, 10)))
  return (
    <>
      <p>
        <select
          name="film"
          value={querySingle.data?.film.id}
          onChange={e => {
            const option = e.target.options[e.target.selectedIndex]
            if (option?.value) {
              navigate('/' + option.value)
            }
          }}
        >
          {!queryList.data?.allFilms.edges && (
            <option value="">Loading...</option>
          )}
          {queryList.data?.allFilms.edges.map(({ node }) => (
            <option key={node.id} value={node.id}>{node.title}</option>
          ))}
        </select>
      </p>
      <h2>{querySingle.data?.film?.title || "Loading film..."}</h2>
      <p>
        <Link to="/">back</Link>
      </p>
    </>
  )
}

